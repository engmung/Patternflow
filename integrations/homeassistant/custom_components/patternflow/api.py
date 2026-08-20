"""HTTP client for a Patternflow device.

Built against `docs/rest-api.md`, which is the contract — not against the
firmware source. Two properties of that contract shape everything here:

**One connection.** The device runs a single synchronous, single-client
WebServer, and the render loop is paused while a response is being sent. Every
request in this module therefore goes through one `asyncio.Lock`; two coroutines
must never have sockets open to the same board. Parallel requests at low heap
are what locked devices up hard enough to get an endpoint deleted.

**Queued writes.** `POST /api/sleep` and `GET /api/patterns/select` return the
state as it stands, not as it will be — stopping a DMA engine or running the ELF
relocator belongs in `loop()`, not inside an open HTTP response. Neither writer
here parses the reply's state; callers set their own optimistically and let the
next poll confirm.

There is no authentication anywhere in this API, by design. Nothing in this
module sends a credential because there is nothing to send.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

import aiohttp

from .const import (
    API_MQTT,
    API_PATTERNS,
    API_PATTERNS_FILE,
    API_PATTERNS_SELECT,
    API_SLEEP,
    API_STATUS,
    REQUEST_TIMEOUT,
)

_LOGGER = logging.getLogger(__name__)


class PatternflowError(Exception):
    """Base error for anything this client could not complete."""


class PatternflowConnectionError(PatternflowError):
    """The device did not answer, or did not answer usefully."""


class PatternflowNotFound(PatternflowError):
    """The device answered 404 — usually a feature compiled out of the build."""


class PatternflowClient:
    """Talks to one device. One instance per config entry."""

    def __init__(self, session: aiohttp.ClientSession, host: str) -> None:
        """Store the session and the host this client is bound to."""
        self._session = session
        self._host = host
        # Serialises every request to this device. See the module docstring:
        # the constraint is the device's, not ours.
        self._lock = asyncio.Lock()

    @property
    def host(self) -> str:
        """The host this client talks to."""
        return self._host

    def _url(self, path: str) -> str:
        return f"http://{self._host}{path}"

    async def _request(
        self,
        method: str,
        path: str,
        params: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Perform one request and return its decoded JSON body.

        Retried once. The device drops the occasional reply under load — its own
        console pages pace uploads and retry for the same reason — and a single
        retry turns that from a visible "unavailable" flap into nothing.
        """
        url = self._url(path)
        timeout = aiohttp.ClientTimeout(total=REQUEST_TIMEOUT)
        last_error: Exception | None = None

        async with self._lock:
            for attempt in (1, 2):
                try:
                    async with self._session.request(
                        method, url, params=params, timeout=timeout
                    ) as response:
                        if response.status == 404:
                            raise PatternflowNotFound(f"{path} is not on this device")
                        response.raise_for_status()
                        # The firmware hand-assembles JSON and labels it
                        # application/json, but /api/patterns/file serves a
                        # sidecar as a download. Do not let aiohttp's content
                        # type check decide for us.
                        return await response.json(content_type=None)
                except PatternflowNotFound:
                    raise
                except (TimeoutError, aiohttp.ClientError, ValueError) as err:
                    last_error = err
                    if attempt == 1:
                        _LOGGER.debug("%s %s failed (%s), retrying once", method, url, err)
                        continue

        raise PatternflowConnectionError(f"{method} {path} failed: {last_error}") from last_error

    async def get_status(self) -> dict[str, Any]:
        """Device state: sleep, active pattern, network, heap, render timings."""
        return await self._request("GET", API_STATUS)

    async def get_patterns(self) -> dict[str, Any]:
        """Return the installed pattern list and which index is active."""
        return await self._request("GET", API_PATTERNS)

    async def get_mqtt(self) -> dict[str, Any]:
        """MQTT role and broker state — and, usefully, the live knob positions.

        `knobs` and `params` here are readable in *any* MQTT role and with no
        broker configured at all: the firmware copies the input frame into that
        state before it checks the role. This is the only way to read knob
        positions over HTTP.

        Raises PatternflowNotFound on a build with PF_MQTT_ENABLED 0.
        """
        return await self._request("GET", API_MQTT)

    async def get_sidecar(self, slug: str) -> dict[str, Any]:
        """One module's metadata: knob labels, author, licence, absoluteReady.

        Presets compiled into the firmware have no sidecar and are not
        addressable here; their labels live in C++ and are not exposed at all.
        """
        return await self._request("GET", API_PATTERNS_FILE, params={"slug": slug, "ext": "json"})

    async def set_mqtt_role(self, role: str) -> dict[str, Any]:
        """Put the device into an MQTT role, and return its new MQTT state.

        Only a Subscriber obeys knob, param and pattern topics. The cost is
        real and belongs in whatever asks for this: a Subscriber stops
        publishing its own knob turns, because the two roles are exclusive.
        """
        return await self._request("POST", API_MQTT, params={"role": role})

    async def set_sleep(self, sleep: bool) -> None:
        """Put the panel to sleep, or wake it.

        The reply reports the state *before* the transition and is deliberately
        discarded — see the module docstring.
        """
        await self._request("POST", API_SLEEP, params={"on": "1" if sleep else "0"})

    async def select_pattern(self, index: int) -> None:
        """Switch to the pattern at this registry index.

        Indices are not stable across installs and deletes: a single new .pfm
        renumbers everything after it. Always select against a freshly read
        list.
        """
        await self._request("GET", API_PATTERNS_SELECT, params={"index": str(index)})
