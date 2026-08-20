"""Following a hand on the encoders.

The device never says what a pattern's parameters are — there is no endpoint
for "Hue is 0.42". It does report the raw encoder counter, and that moves only
under a hand, because the firmware adds remote deltas on top of it after
computing the frame's deltas from it. So a change there is a physical turn, and
a detent is a known fraction of a range.

Which makes this dead reckoning: it tracks changes correctly and knows nothing
about where the value started. These tests pin the arithmetic and the three
cases where it must NOT act.
"""

from __future__ import annotations

import pytest
from patternflow.const import DETENTS_PER_RANGE


class Tracker:
    """The coordinator's physical-turn logic, without Home Assistant.

    Mirrors PatternflowCoordinator._apply_physical_turns. Kept here rather than
    imported because the coordinator needs the harness; the arithmetic is the
    part that can be wrong.
    """

    def __init__(self, percent: list[float] | None = None):
        self.percent = percent or [50.0, 50.0, 50.0, 50.0]
        self.clicks: list[int | None] = [None, None, None, None]
        self.target: list[float | None] = [None, None, None, None]

    def poll(self, counts: list[int], held: list[bool] | None = None) -> None:
        for index in range(min(4, len(counts))):
            count = counts[index]
            previous = self.clicks[index]
            self.clicks[index] = count
            if previous is None or count == previous:
                continue
            if held and index < len(held) and held[index]:
                continue
            moved = (count - previous) * 100 / DETENTS_PER_RANGE
            self.percent[index] = max(0.0, min(100.0, self.percent[index] + moved))
            self.target[index] = None


class TestTracking:
    """Turning the real knob moves the value here."""

    def test_the_first_poll_only_establishes_a_baseline(self):
        # There is nothing to compare against yet, and treating the absolute
        # count as a delta would slam the value to an end on startup.
        tracker = Tracker()
        tracker.poll([128, -4, 0, 96])
        assert tracker.percent == [50.0, 50.0, 50.0, 50.0]

    def test_a_quarter_turn_moves_a_quarter_of_the_way(self):
        # 48 detents cross a whole range, so 12 is 25%.
        tracker = Tracker()
        tracker.poll([0, 0, 0, 0])
        tracker.poll([12, 0, 0, 0])
        assert tracker.percent[0] == pytest.approx(75.0)

    def test_turning_back_comes_back(self):
        tracker = Tracker()
        tracker.poll([0, 0, 0, 0])
        tracker.poll([12, 0, 0, 0])
        tracker.poll([0, 0, 0, 0])
        assert tracker.percent[0] == pytest.approx(50.0)

    def test_each_encoder_moves_only_its_own_value(self):
        tracker = Tracker()
        tracker.poll([0, 0, 0, 0])
        tracker.poll([0, 24, 0, 0])
        assert tracker.percent == [50.0, 100.0, 50.0, 50.0]

    def test_a_counter_that_has_gone_negative_still_works(self):
        # The encoder count is signed and unbounded; nothing resets it.
        tracker = Tracker()
        tracker.poll([-100, 0, 0, 0])
        tracker.poll([-88, 0, 0, 0])
        assert tracker.percent[0] == pytest.approx(75.0)

    def test_the_net_change_between_polls_is_what_lands(self):
        # Polling is every ten seconds, so a turn is usually seen as its total
        # rather than click by click. That has to be the same answer.
        stepwise = Tracker()
        stepwise.poll([0, 0, 0, 0])
        for count in range(1, 13):
            stepwise.poll([count, 0, 0, 0])

        at_once = Tracker()
        at_once.poll([0, 0, 0, 0])
        at_once.poll([12, 0, 0, 0])

        assert stepwise.percent[0] == pytest.approx(at_once.percent[0])


class TestRestraint:
    """The three cases where inferring anything would be wrong."""

    def test_a_held_channel_is_left_alone(self):
        # An absolute hold reports its own value, which outranks anything
        # inferred. The firmware drops the hold on physical motion, so this
        # only skips the poll the turn lands on.
        tracker = Tracker()
        tracker.poll([0, 0, 0, 0], held=[True, False, False, False])
        tracker.poll([24, 0, 0, 0], held=[True, False, False, False])
        assert tracker.percent[0] == 50.0

    def test_it_clamps_rather_than_wrapping(self):
        # Somebody who keeps turning past the end should find the value at the
        # end. Jumping to the other extreme would be a worse lie — and whether
        # a knob wraps is the pattern's business, not something we can know.
        tracker = Tracker()
        tracker.poll([0, 0, 0, 0])
        tracker.poll([500, 0, 0, 0])
        assert tracker.percent[0] == 100.0
        tracker.poll([-500, 0, 0, 0])
        assert tracker.percent[0] == 0.0

    def test_a_turn_retires_a_value_still_waiting_to_be_confirmed(self):
        # A hand on the encoder wins, and the firmware agrees: physical motion
        # releases the absolute hold. Insisting on our set-point afterwards
        # would fight the person standing at the panel.
        tracker = Tracker()
        tracker.target[0] = 80.0
        tracker.poll([0, 0, 0, 0])
        tracker.poll([6, 0, 0, 0])
        assert tracker.target[0] is None

    def test_no_movement_changes_nothing(self):
        tracker = Tracker()
        tracker.poll([7, 7, 7, 7])
        tracker.poll([7, 7, 7, 7])
        assert tracker.percent == [50.0, 50.0, 50.0, 50.0]
