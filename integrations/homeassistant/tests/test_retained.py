"""Spotting retained messages that re-command the panel.

The bug this exists for: a pattern that had been running for minutes stuttered
and started over, every few minutes, with nothing in any log. The cause was a
retained `<prefix>/pattern` message left on the broker by older firmware — and
because a retained message is redelivered on every subscribe, and the panel
resubscribes on every reconnect, it was a command being re-issued forever.
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest
from patternflow.retained import RetainedWatcher, watched_topics


def message(topic: str, payload: str, *, retain: bool):
    """One MQTT message as the callback sees it."""
    return SimpleNamespace(topic=topic, payload=payload, retain=retain)


@pytest.fixture
def watcher() -> RetainedWatcher:
    """A watcher with no Home Assistant behind it — the logic needs none."""
    return RetainedWatcher(hass=None)


class TestWatchedTopics:
    """Which topics are worth watching."""

    def test_covers_the_three_command_topics(self):
        assert watched_topics("patternflow") == [
            "patternflow/pattern",
            "patternflow/knob/+",
            "patternflow/param/+",
        ]

    def test_snapshot_is_deliberately_absent(self):
        # Retained by design on channels 1-4 and Live. Flagging it would mean
        # crying wolf at a correctly configured show setup; the channel itself
        # is warned about separately.
        assert not any("snapshot" in topic for topic in watched_topics("patternflow"))

    def test_it_follows_the_prefix(self):
        assert watched_topics("patternflow5")[0] == "patternflow5/pattern"


class TestFindings:
    """What counts as a finding, and what does not."""

    def test_a_retained_message_is_recorded(self, watcher):
        watcher._on_message(message("patternflow/pattern", "Wave Saw", retain=True))
        assert watcher.found == {"patternflow/pattern": "Wave Saw"}

    def test_live_traffic_is_ignored(self, watcher):
        # Ordinary operation: another panel publishing, a script, or this
        # integration's own knob writes. None of it comes back by itself.
        watcher._on_message(message("patternflow/param/1", "750", retain=False))
        assert watcher.found == {}

    def test_an_empty_retained_payload_is_the_cleared_state(self, watcher):
        # Publishing empty-and-retained is how a retained message is deleted,
        # so seeing one means the topic is clean, not that it holds "".
        watcher._on_message(message("patternflow/pattern", "Wave Saw", retain=True))
        watcher._on_message(message("patternflow/pattern", "", retain=True))
        assert watcher.found == {}

    def test_live_traffic_clears_a_previous_finding(self, watcher):
        watcher._on_message(message("patternflow/knob/2", "128", retain=True))
        watcher._on_message(message("patternflow/knob/2", "130", retain=False))
        assert watcher.found == {}

    def test_several_topics_are_tracked_separately(self, watcher):
        watcher._on_message(message("patternflow/pattern", "Origin", retain=True))
        watcher._on_message(message("patternflow/param/3", "500", retain=True))
        assert sorted(watcher.found) == ["patternflow/param/3", "patternflow/pattern"]

    def test_a_message_without_a_topic_is_dropped(self, watcher):
        watcher._on_message(SimpleNamespace(payload="x", retain=True, topic=""))
        assert watcher.found == {}


class TestBites:
    """Whether a finding is worth telling anyone about."""

    def test_a_subscriber_obeys_them(self, watcher):
        watcher._on_message(message("patternflow/pattern", "Origin", retain=True))
        assert watcher.bites({"role": "subscriber"})

    def test_a_publisher_ignores_them(self, watcher):
        # Real, and inert: knob, param and pattern topics are only obeyed in
        # Subscriber role. Warning here would be noise.
        watcher._on_message(message("patternflow/pattern", "Origin", retain=True))
        assert not watcher.bites({"role": "publisher"})

    def test_nothing_found_is_never_a_problem(self, watcher):
        assert not watcher.bites({"role": "subscriber"})

    def test_no_mqtt_state_is_never_a_problem(self, watcher):
        watcher._on_message(message("patternflow/pattern", "Origin", retain=True))
        assert not watcher.bites(None)
