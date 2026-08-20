"""The two things that made the sliders feel wrong on hardware.

Both were found by using the thing, not by reading it, and neither produced an
error anywhere — which is why they get tests of their own rather than a line in
an existing file.
"""

from __future__ import annotations

import pytest
from patternflow.knobs import detents_with_residual, fights_snapshot

#: Percent covered by one detent — 48 of them cross a whole range.
PER_DETENT = 100 / 48


class TestResidual:
    """Small moves have to add up instead of vanishing."""

    def test_a_one_percent_nudge_sends_nothing_but_is_remembered(self):
        # 1% is 0.48 of a detent. There is no such thing as half a click, so
        # nothing goes out — but throwing the remainder away is what made the
        # slider feel dead until it was dragged hard.
        detents, residual = detents_with_residual(50, 51, 0.0)
        assert detents == 0
        assert residual == pytest.approx(1.0)

    def test_two_one_percent_nudges_add_up_to_a_click(self):
        detents, residual = detents_with_residual(50, 51, 0.0)
        detents, residual = detents_with_residual(51, 52, residual)
        assert detents == 1
        assert residual == pytest.approx(2.0 - PER_DETENT)

    def test_many_small_nudges_arrive_in_full(self):
        # Twenty one-percent steps is twenty percent of the range, and the
        # device must end up having been told so — give or take the one
        # sub-detent remainder still in hand.
        residual = 0.0
        sent = 0
        for step in range(20):
            detents, residual = detents_with_residual(50 + step, 51 + step, residual)
            sent += detents
        assert sent * PER_DETENT == pytest.approx(20.0 - residual)

    def test_a_full_sweep_still_sends_a_full_sweep(self):
        detents, residual = detents_with_residual(0, 100, 0.0)
        assert detents == 48
        assert residual == pytest.approx(0.0)

    def test_it_works_downwards_too(self):
        detents, residual = detents_with_residual(50, 49, 0.0)
        assert detents == 0
        detents, residual = detents_with_residual(49, 48, residual)
        assert detents == -1

    def test_a_carried_remainder_does_not_grow_without_bound(self):
        # If it did, a long slow drag would end with a large unsent debt that
        # arrives all at once the moment somebody moves the slider properly.
        residual = 0.0
        for step in range(200):
            _, residual = detents_with_residual(step * 0.1, (step + 1) * 0.1, residual)
            assert abs(residual) <= PER_DETENT


class TestSnapshotChannels:
    """Some channels overwrite whatever Home Assistant sets."""

    @pytest.mark.parametrize("channel", ["ch1", "ch2", "ch3", "ch4", "live"])
    def test_show_channels_fight_back(self, channel):
        # These subscribe to a RETAINED <prefix>/snapshot carrying param values,
        # which the firmware applies straight onto the knobs — and a Publisher
        # on the channel re-sends one every 8 s. The write succeeds and then
        # undoes itself, with nothing reporting an error.
        assert fights_snapshot({"channel": channel, "role": "subscriber"})

    def test_broadcast_does_not(self):
        # Prefix `patternflow` exactly. No snapshot subscription at all, which
        # is what makes it the channel to be on for this.
        assert not fights_snapshot({"channel": "broadcast", "role": "subscriber"})

    def test_a_custom_prefix_does_not(self):
        assert not fights_snapshot({"channel": "custom", "role": "subscriber"})

    def test_no_mqtt_state_is_not_a_fight(self):
        assert not fights_snapshot(None)
        assert not fights_snapshot({})
