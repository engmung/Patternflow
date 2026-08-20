"""Tests for the knob write path.

The absolute path is closed loop and mostly arithmetic. The delta path is not:
it is open loop by construction, it depends on state the device silently
resets, and getting it wrong sends one enormous turn instead of a small one.
Most of what is here is about that.
"""

from __future__ import annotations

import pytest
from patternflow.knobs import (
    KnobWriter,
    KnobWriteUnavailable,
    is_writable,
    param_to_percent,
    percent_delta_to_detents,
    percent_to_param,
    unavailable_reason,
)


class FakeHass:
    """Just enough Home Assistant to look like MQTT is or is not set up."""

    def __init__(self, mqtt_configured=True):
        self.config_entries = _FakeEntries(mqtt_configured)


class _FakeEntries:
    def __init__(self, mqtt_configured):
        self._mqtt_configured = mqtt_configured

    def async_entries(self, domain):
        return ["entry"] if (domain == "mqtt" and self._mqtt_configured) else []


class RecordingWriter(KnobWriter):
    """A KnobWriter whose publishes are captured instead of sent."""

    def __init__(self, hass=None):
        super().__init__(hass or FakeHass())
        self.published: list[tuple[str, str]] = []

    async def _publish(self, topic, payload):
        self.published.append((topic, payload))


class TestScales:
    """Percent to the wire and back."""

    @pytest.mark.parametrize(("percent", "expected"), [(0, 0), (50, 500), (100, 1000), (12.3, 123)])
    def test_percent_to_param(self, percent, expected):
        assert percent_to_param(percent) == expected

    def test_percent_to_param_clamps(self):
        # The bus is 0..1000 and the firmware clamps too, but sending something
        # out of range means a bug here, not there.
        assert percent_to_param(-10) == 0
        assert percent_to_param(150) == 1000

    def test_param_to_percent_round_trips(self):
        assert param_to_percent(percent_to_param(37)) == 37.0

    def test_param_to_percent_of_nonsense_is_none(self):
        assert param_to_percent(None) is None
        assert param_to_percent("500") is None

    def test_a_full_sweep_is_two_turns_of_the_encoder(self):
        # 24 detents per turn, two turns across a range. This has to match
        # web/src/lib/patternflowControls.ts or the same drag feels different
        # on the device than in the web preview.
        assert percent_delta_to_detents(0, 100) == 48

    def test_a_small_move_rounds_to_no_detents(self):
        # There is no such thing as half a click; sending 0 sends nothing.
        assert percent_delta_to_detents(50, 50.5) == 0

    def test_detents_are_signed(self):
        assert percent_delta_to_detents(75, 25) == -24


class TestWritability:
    """Whether a write would land, and why not when it would not."""

    def test_subscriber_and_connected_is_writable(self):
        assert is_writable({"role": "subscriber", "connected": True})

    def test_a_publisher_is_not(self):
        # Publisher and Subscriber are exclusive, and only a Subscriber obeys
        # knob and param topics. Sleep is obeyed in either — that asymmetry is
        # the firmware's, not ours.
        state = {"role": "publisher", "connected": True, "configured": True}
        assert not is_writable(state)
        assert unavailable_reason(state) == "not_subscriber"

    def test_no_mqtt_endpoint_at_all(self):
        assert not is_writable(None)
        assert unavailable_reason(None) == "mqtt_compiled_out"

    def test_no_broker_configured(self):
        assert unavailable_reason({"role": "off", "configured": False}) == "no_broker"

    def test_configured_but_not_connected(self):
        state = {"role": "subscriber", "configured": True, "connected": False}
        assert unavailable_reason(state) == "broker_unreachable"

    def test_nothing_wrong_is_none(self):
        assert (
            unavailable_reason({"role": "subscriber", "configured": True, "connected": True})
            is None
        )


class TestAbsolutePath:
    """`<prefix>/param/N` — a set-point the device holds."""

    async def test_publishes_the_wire_scale_on_a_one_based_topic(self):
        writer = RecordingWriter()
        await writer.async_set_absolute("patternflow", 0, 75)
        assert writer.published == [("patternflow/param/1", "750")]

    async def test_the_fourth_knob_is_topic_four(self):
        # Off-by-one here means turning the wrong knob, silently.
        writer = RecordingWriter()
        await writer.async_set_absolute("patternflow", 3, 10)
        assert writer.published[0][0] == "patternflow/param/4"

    async def test_release_is_an_empty_payload_not_a_zero(self):
        # Empty means "stop holding"; "0" would pin the parameter to the bottom
        # of its range, which is a very different thing to ask for.
        writer = RecordingWriter()
        await writer.async_release_absolute("patternflow", 1)
        assert writer.published == [("patternflow/param/2", "")]

    async def test_a_custom_prefix_is_honoured(self):
        # The prefix is read off the device, not assumed — channels 1..4 and a
        # custom prefix all change it.
        writer = RecordingWriter()
        await writer.async_set_absolute("studio/panel3", 2, 50)
        assert writer.published[0][0] == "studio/panel3/param/3"


class TestDeltaPath:
    """`<prefix>/knob/N` — an absolute count the device diffs against."""

    async def test_the_first_publish_is_seeded_from_the_physical_counter(self):
        # The device has not heard from us, so it diffs against its own encoder
        # count. Sending physical+delta is what makes the delta arrive as the
        # delta.
        writer = RecordingWriter()
        await writer.async_nudge("patternflow", 0, detents=6, physical_count=128)
        assert writer.published == [("patternflow/knob/1", "134")]

    async def test_later_publishes_continue_from_what_we_sent(self):
        # Now the device diffs against the last value it received, so the
        # running total has to be ours — reseeding from the physical counter
        # again would send the difference of two unrelated numbers.
        writer = RecordingWriter()
        await writer.async_nudge("patternflow", 0, detents=6, physical_count=128)
        await writer.async_nudge("patternflow", 0, detents=4, physical_count=128)
        assert [payload for _, payload in writer.published] == ["134", "138"]

    async def test_zero_detents_sends_nothing(self):
        writer = RecordingWriter()
        await writer.async_nudge("patternflow", 0, detents=0, physical_count=128)
        assert writer.published == []

    async def test_each_knob_keeps_its_own_running_count(self):
        writer = RecordingWriter()
        await writer.async_nudge("patternflow", 0, detents=5, physical_count=100)
        await writer.async_nudge("patternflow", 1, detents=5, physical_count=200)
        assert writer.published == [
            ("patternflow/knob/1", "105"),
            ("patternflow/knob/2", "205"),
        ]

    async def test_a_device_reconnect_reseeds_from_the_physical_counter(self):
        # The firmware's resetSessionState() clears its per-knob "last value
        # received" on every connect and role change. Without reseeding, the
        # next publish is diffed against the physical counter and the whole
        # history of what we ever sent arrives as one turn.
        writer = RecordingWriter()
        writer.note_connection({"connected": True})
        await writer.async_nudge("patternflow", 0, detents=40, physical_count=0)
        assert writer.published[-1] == ("patternflow/knob/1", "40")

        writer.note_connection({"connected": False})
        writer.note_connection({"connected": True})

        await writer.async_nudge("patternflow", 0, detents=3, physical_count=0)
        # 3, not 43. The device sees a three-detent turn, which is what happened.
        assert writer.published[-1] == ("patternflow/knob/1", "3")

    async def test_staying_connected_does_not_reseed(self):
        writer = RecordingWriter()
        writer.note_connection({"connected": True})
        await writer.async_nudge("patternflow", 0, detents=10, physical_count=0)
        writer.note_connection({"connected": True})
        await writer.async_nudge("patternflow", 0, detents=10, physical_count=0)
        assert writer.published[-1] == ("patternflow/knob/1", "20")


class TestPublishGuards:
    """What happens when Home Assistant itself cannot send."""

    async def test_no_mqtt_integration_is_a_named_failure(self):
        # Not a crash and not a silent no-op: the entity turns this into a
        # message that says to go and set MQTT up.
        writer = KnobWriter(FakeHass(mqtt_configured=False))
        with pytest.raises(KnobWriteUnavailable) as err:
            await writer.async_set_absolute("patternflow", 0, 50)
        assert str(err.value) == "mqtt_not_set_up"
