"""Tests for the pure device-to-Home-Assistant translations."""

from __future__ import annotations

from patternflow.helpers import (
    active_option,
    build_pattern_options,
    fps_from_frame_us,
    knob_labels,
    looks_like_patternflow,
)


class TestLooksLikePatternflow:
    """Whatever answered a probe has to prove it is a device."""

    def test_accepts_a_real_status(self, status):
        assert looks_like_patternflow(status)

    def test_rejects_another_device_on_the_same_service_type(self):
        # `_http._tcp` is about as generic as mDNS gets, and the records carry
        # no TXT data to filter on, so this rejection is the whole check.
        assert not looks_like_patternflow({"name": "Some Printer", "model": "X"})

    def test_rejects_a_non_object(self):
        assert not looks_like_patternflow("<html>404</html>")
        assert not looks_like_patternflow(None)


class TestBuildPatternOptions:
    """Options and the reverse map they select through."""

    def test_plain_list(self, patterns):
        options, by_option = build_pattern_options(patterns["patterns"])
        assert options == ["Origin", "Wave Saw", "Firefly Hollow"]
        assert by_option["Firefly Hollow"] == 2

    def test_duplicate_names_are_disambiguated_by_slug(self):
        # Two community modules may legitimately carry the same display name.
        # Without this, one of them is unreachable from the dropdown.
        options, by_option = build_pattern_options(
            [
                {"index": 0, "name": "Bloom", "module": "bloom"},
                {"index": 1, "name": "Bloom", "module": "bloom_v2"},
            ]
        )
        assert options == ["Bloom (bloom)", "Bloom (bloom_v2)"]
        assert by_option == {"Bloom (bloom)": 0, "Bloom (bloom_v2)": 1}

    def test_duplicate_preset_names_fall_back_to_position(self):
        # A preset has no slug to disambiguate with.
        options, by_option = build_pattern_options(
            [
                {"index": 0, "name": "Origin", "module": None},
                {"index": 1, "name": "Origin", "module": None},
            ]
        )
        assert options == ["Origin (#1)", "Origin (#2)"]
        assert len(by_option) == 2

    def test_every_option_maps_to_exactly_one_index(self):
        # The map losing an entry means selecting one pattern switches to
        # another, which is the worst failure this function has.
        options, by_option = build_pattern_options(
            [{"index": i, "name": "Same", "module": None} for i in range(5)]
        )
        assert len(options) == len(set(options)) == 5
        assert sorted(by_option.values()) == [0, 1, 2, 3, 4]

    def test_unnamed_pattern_still_gets_a_label(self):
        options, _ = build_pattern_options([{"index": 3, "name": "", "module": None}])
        assert options == ["Pattern 4"]

    def test_entries_without_an_index_are_skipped(self):
        options, by_option = build_pattern_options(
            [{"name": "No index"}, {"index": 1, "name": "Fine", "module": None}]
        )
        assert options == ["Fine"]
        assert by_option == {"Fine": 1}


class TestActiveOption:
    """Which option is the running one."""

    def test_finds_the_active_pattern(self, patterns):
        options, _ = build_pattern_options(patterns["patterns"])
        assert active_option(options, patterns["patterns"], 1) == "Wave Saw"

    def test_nothing_loaded_is_none_not_an_error(self, patterns):
        # -1 is a real state: a module is being reloaded, or one failed to load.
        options, _ = build_pattern_options(patterns["patterns"])
        assert active_option(options, patterns["patterns"], -1) is None
        assert active_option(options, patterns["patterns"], None) is None

    def test_index_not_in_the_list_is_none(self, patterns):
        options, _ = build_pattern_options(patterns["patterns"])
        assert active_option(options, patterns["patterns"], 99) is None


class TestFpsFromFrameUs:
    """Frame time to frame rate."""

    def test_converts(self):
        assert fps_from_frame_us(16400) == 61.0

    def test_zero_is_none_rather_than_a_division_by_zero(self):
        # frameUs is 0 before the first frame is timed and while asleep.
        assert fps_from_frame_us(0) is None
        assert fps_from_frame_us(-1) is None

    def test_missing_is_none(self):
        assert fps_from_frame_us(None) is None
        assert fps_from_frame_us("fast") is None


class TestKnobLabels:
    """Four labels, always."""

    def test_reads_the_sidecar(self):
        labels = knob_labels({"knobs": ["Waves", "Speed", "Sun", "Glitter"]})
        assert labels == ["Waves", "Speed", "Sun", "Glitter"]

    def test_a_preset_has_no_sidecar_and_gets_k1_to_k4(self):
        # Presets keep their labels in C++ where no endpoint exposes them.
        # Admitting that beats guessing.
        assert knob_labels(None) == ["K1", "K2", "K3", "K4"]

    def test_a_short_or_ragged_list_is_padded(self):
        assert knob_labels({"knobs": ["Hue", None, ""]}) == ["Hue", "K2", "K3", "K4"]

    def test_a_sidecar_without_knobs_gets_the_fallback(self):
        assert knob_labels({"name": "Something"}) == ["K1", "K2", "K3", "K4"]
