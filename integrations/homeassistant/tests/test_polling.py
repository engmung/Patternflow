"""Which endpoints get polled, and when.

The device's web server is the scarcest thing in this integration, and one of
its behaviours is easy to break from the outside without any error appearing
anywhere: opening a console page evicts the running pattern, and the firmware
only gives it back after 25 s during which no `/api/` call refreshes its idle
timer. `/api/mqtt`, `/api/patterns` and `/api/patterns/file` all refresh it.

A ten-second poll therefore holds the pause open forever, and the panel stays
dark long after the browser tab that caused it is gone. That is the failure
these tests exist for; it was shipped once and found on hardware.

Testing the endpoint *choice* rather than the coordinator (which needs Home
Assistant) keeps this in the dependency-light suite, and the choice is the part
that was wrong.
"""

from __future__ import annotations

import pytest

# The endpoints that refresh the firmware's console idle timer, from
# noteConsoleApiCall() call sites in core_mqtt_http.h, core_patterns_http.h and
# core_status_http.h. Keep in step with docs/rest-api.md.
EXTENDS_CONSOLE_PAUSE = {
    "/api/mqtt",
    "/api/patterns",
    "/api/patterns/file",
    "/api/sleep",
}

#: The only endpoint that never touches it, and so the only one safe to poll.
SAFE_TO_POLL = "/api/status"


class Recorder:
    """A client stand-in that records which endpoints a tick asks for."""

    def __init__(self, *, console_paused: bool):
        self.console_paused = console_paused
        self.asked: list[str] = []

    async def get_status(self):
        self.asked.append("/api/status")
        return {
            "version": "3.5.1",
            "panel": "128x64",
            "patterns": 3,
            "consolePaused": self.console_paused,
            "sleep": False,
        }

    async def get_mqtt(self):
        self.asked.append("/api/mqtt")
        return {"role": "subscriber", "connected": True, "prefix": "patternflow"}

    async def get_patterns(self):
        self.asked.append("/api/patterns")
        return {"active": 1, "patterns": [{"index": 1, "name": "Wave Saw", "module": "wave_saw"}]}

    async def get_sidecar(self, slug):
        self.asked.append("/api/patterns/file")
        return {"knobs": ["a", "b", "c", "d"], "absoluteReady": True}


async def tick(recorder: Recorder) -> list[str]:
    """One poll, with the coordinator's endpoint choice inlined.

    Mirrors PatternflowCoordinator._async_update_data. Not the real thing —
    that needs Home Assistant — but the branch it is asserting is the branch
    that decides whether a paused panel ever comes back.
    """
    status = await recorder.get_status()
    if not status.get("consolePaused"):
        await recorder.get_mqtt()
        await recorder.get_patterns()
        await recorder.get_sidecar("wave_saw")
    return recorder.asked


class TestConsolePause:
    """Polling must not outlive the console session that paused the pattern."""

    async def test_a_normal_tick_reads_everything(self):
        recorder = Recorder(console_paused=False)
        assert await tick(recorder) == [
            "/api/status",
            "/api/mqtt",
            "/api/patterns",
            "/api/patterns/file",
        ]

    async def test_a_paused_tick_asks_for_nothing_that_holds_the_pause_open(self):
        recorder = Recorder(console_paused=True)
        asked = await tick(recorder)
        assert asked == [SAFE_TO_POLL]
        assert not EXTENDS_CONSOLE_PAUSE.intersection(asked)

    @pytest.mark.parametrize("ticks", [1, 3, 10])
    async def test_repeated_paused_ticks_never_touch_the_timer(self, ticks):
        # The 25 s window is longer than the default 10 s interval, so a single
        # slip on any tick is enough to keep the panel dark indefinitely.
        recorder = Recorder(console_paused=True)
        for _ in range(ticks):
            await tick(recorder)
        assert set(recorder.asked) == {SAFE_TO_POLL}

    async def test_status_is_not_one_of_the_endpoints_that_extends_the_pause(self):
        # If this ever becomes false in the firmware, the back-off above stops
        # working and there is no safe endpoint left to poll at all.
        assert SAFE_TO_POLL not in EXTENDS_CONSOLE_PAUSE
