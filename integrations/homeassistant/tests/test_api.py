"""Tests for the REST client.

Driven by a fake session rather than a mock HTTP library: what is worth checking
here is the client's own behaviour — that it serialises requests, retries once,
tells 404 apart from a failure, and never trusts the reply of a queued write —
and a fake makes all four observable without a server.
"""

from __future__ import annotations

import asyncio

import aiohttp
import pytest
from patternflow.api import (
    PatternflowClient,
    PatternflowConnectionError,
    PatternflowNotFound,
)


class FakeResponse:
    """Enough of aiohttp's response to satisfy the client."""

    def __init__(self, status: int, payload):
        self.status = status
        self._payload = payload

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    def raise_for_status(self):
        if self.status >= 400:
            raise aiohttp.ClientResponseError(None, (), status=self.status)

    async def json(self, content_type=None):
        if isinstance(self._payload, Exception):
            raise self._payload
        return self._payload


class FakeSession:
    """Records calls and replays queued outcomes."""

    def __init__(self, outcomes):
        #: Each entry is a FakeResponse, or an exception to raise on request.
        self._outcomes = list(outcomes)
        self.calls: list[tuple[str, str, dict | None]] = []
        self.in_flight = 0
        self.max_in_flight = 0

    def request(self, method, url, params=None, timeout=None):
        self.calls.append((method, url, params))
        outcome = self._outcomes.pop(0) if self._outcomes else FakeResponse(200, {})
        if isinstance(outcome, Exception):
            raise outcome
        return _Tracked(self, outcome)


class _Tracked:
    """Wraps a response so overlapping requests would be visible."""

    def __init__(self, session: FakeSession, response: FakeResponse):
        self._session = session
        self._response = response

    async def __aenter__(self):
        self._session.in_flight += 1
        self._session.max_in_flight = max(self._session.max_in_flight, self._session.in_flight)
        # Yield, so two coroutines racing this would actually overlap.
        await asyncio.sleep(0)
        return self._response

    async def __aexit__(self, *exc):
        self._session.in_flight -= 1
        return False


def client_with(*outcomes) -> tuple[PatternflowClient, FakeSession]:
    """A client wired to a session that will produce these outcomes."""
    session = FakeSession(outcomes)
    return PatternflowClient(session, "patternflow.local"), session


class TestRequests:
    """URL building and decoding."""

    async def test_get_status(self, status):
        client, session = client_with(FakeResponse(200, status))
        assert await client.get_status() == status
        method, url, params = session.calls[0]
        assert (method, url) == ("GET", "http://patternflow.local/api/status")
        assert params is None

    async def test_select_sends_the_index_as_a_query_parameter(self):
        # The firmware has no JSON body parser; everything is query or form.
        client, session = client_with(FakeResponse(200, {"ok": True}))
        await client.select_pattern(7)
        method, url, params = session.calls[0]
        assert method == "GET"
        assert url.endswith("/api/patterns/select")
        assert params == {"index": "7"}

    @pytest.mark.parametrize(("sleep", "expected"), [(True, "1"), (False, "0")])
    async def test_sleep_sends_on_as_one_or_zero(self, sleep, expected):
        client, session = client_with(FakeResponse(200, {"ok": True}))
        await client.set_sleep(sleep)
        method, _, params = session.calls[0]
        assert method == "POST"
        assert params == {"on": expected}

    async def test_sleep_ignores_the_state_in_the_reply(self):
        # POST /api/sleep reports the state BEFORE the transition, because the
        # request is only queued. A client that believed it would flip the
        # switch straight back.
        client, _ = client_with(FakeResponse(200, {"ok": True, "sleep": False}))
        assert await client.set_sleep(True) is None

    async def test_sidecar_asks_for_the_json_extension(self):
        client, session = client_with(FakeResponse(200, {"knobs": []}))
        await client.get_sidecar("wave_saw")
        _, url, params = session.calls[0]
        assert url.endswith("/api/patterns/file")
        assert params == {"slug": "wave_saw", "ext": "json"}


class TestFailures:
    """What the client does when the device does not cooperate."""

    async def test_404_is_its_own_error(self):
        # /api/mqtt is absent on a PF_MQTT_ENABLED 0 build. That is a permanent
        # property of the firmware, not a transient failure, and the coordinator
        # stops asking — so it must not look like a connection problem.
        client, _ = client_with(FakeResponse(404, None))
        with pytest.raises(PatternflowNotFound):
            await client.get_mqtt()

    async def test_404_is_not_retried(self):
        client, session = client_with(FakeResponse(404, None), FakeResponse(200, {}))
        with pytest.raises(PatternflowNotFound):
            await client.get_mqtt()
        assert len(session.calls) == 1

    async def test_one_timeout_is_retried_and_succeeds(self, status):
        # The device drops the occasional reply under load. One retry turns a
        # visible "unavailable" flap into nothing.
        client, session = client_with(TimeoutError(), FakeResponse(200, status))
        assert await client.get_status() == status
        assert len(session.calls) == 2

    async def test_two_failures_raise(self):
        client, session = client_with(TimeoutError(), TimeoutError())
        with pytest.raises(PatternflowConnectionError):
            await client.get_status()
        assert len(session.calls) == 2

    async def test_a_truncated_body_is_a_connection_error(self):
        # A device low on internal heap answers with headers and an empty or
        # partial body rather than failing outright.
        client, _ = client_with(
            FakeResponse(200, ValueError("unexpected end of data")),
            FakeResponse(200, ValueError("unexpected end of data")),
        )
        with pytest.raises(PatternflowConnectionError):
            await client.get_status()


class TestSerialisation:
    """The device takes one connection. This is not optional."""

    async def test_concurrent_calls_never_overlap(self, status, patterns):
        client, session = client_with(
            FakeResponse(200, status),
            FakeResponse(200, patterns),
            FakeResponse(200, {}),
        )
        await asyncio.gather(client.get_status(), client.get_patterns(), client.set_sleep(False))
        assert session.max_in_flight == 1
        assert len(session.calls) == 3
