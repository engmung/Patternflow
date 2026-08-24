"""Checks on the integration's metadata.

`hassfest` runs against this integration in CI now that the component sits at
`custom_components/patternflow/`, and it covers most of what is here. These stay
because they run in milliseconds without Docker or Home Assistant, and because
every one of these mistakes is invisible until someone tries to install it.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

PACKAGE = Path(__file__).resolve().parents[3] / "custom_components" / "patternflow"

REQUIRED_MANIFEST_KEYS = {
    "domain",
    "name",
    "codeowners",
    "config_flow",
    "documentation",
    "integration_type",
    "iot_class",
    "issue_tracker",
    # Required for a *custom* integration specifically — Home Assistant refuses
    # to load one without it, and core integrations do not carry it.
    "version",
}


def read_json(path: Path) -> dict:
    """Parse one JSON file."""
    return json.loads(path.read_text(encoding="utf-8"))


@pytest.fixture
def manifest() -> dict:
    """The integration manifest."""
    return read_json(PACKAGE / "manifest.json")


@pytest.fixture
def strings() -> dict:
    """The source strings."""
    return read_json(PACKAGE / "strings.json")


class TestManifest:
    """What Home Assistant reads before it loads anything."""

    def test_has_every_required_key(self, manifest):
        assert manifest.keys() >= REQUIRED_MANIFEST_KEYS

    def test_domain_matches_the_directory(self, manifest):
        assert manifest["domain"] == PACKAGE.name

    def test_keys_are_sorted_the_way_hassfest_wants(self, manifest):
        # domain, name, then alphabetical. hassfest fails the build over this,
        # and it is the kind of thing a hand-edited manifest drifts out of.
        keys = list(manifest)
        assert keys[:2] == ["domain", "name"]
        assert keys[2:] == sorted(keys[2:])

    def test_polls_and_says_so(self, manifest):
        # There is no push channel on the HTTP API — no WebSocket, no SSE. If
        # this ever says local_push, something is lying.
        assert manifest["iot_class"] == "local_polling"

    def test_pulls_in_no_runtime_dependencies(self, manifest):
        # aiohttp and voluptuous ship with Home Assistant. A custom integration
        # that installs packages is one that breaks on somebody's upgrade.
        assert manifest["requirements"] == []

    def test_mqtt_is_a_soft_dependency(self, manifest):
        # Knob *writing* needs MQTT, but everything else must load without it.
        # after_dependencies orders the setup; dependencies would require it.
        assert manifest.get("after_dependencies") == ["mqtt"]
        assert "mqtt" not in manifest.get("dependencies", [])

    def test_discovers_both_advertised_services(self, manifest):
        # The device advertises _http._tcp whenever the browser self-update is
        # compiled in, and _arduino._tcp whenever OTA is. A default build has
        # both; a trimmed build may have only one, so match both.
        types = {entry["type"] for entry in manifest["zeroconf"]}
        assert types == {"_http._tcp.local.", "_arduino._tcp.local."}

    def test_zeroconf_matchers_are_narrowed_by_name(self, manifest):
        # _http._tcp is about the most generic service type on a home network.
        # Without a name filter this integration would offer to set up every
        # printer in the house.
        assert all(entry.get("name") for entry in manifest["zeroconf"])


class TestTranslations:
    """Every string the flow can show has to exist, in every language."""

    @pytest.mark.parametrize("language", ["en", "de"])
    def test_no_key_drift_against_strings_json(self, strings, language):
        translation = read_json(PACKAGE / "translations" / f"{language}.json")
        assert _keys(strings) == _keys(translation)

    def test_every_abort_and_error_the_flow_returns_has_a_string(self, strings):
        # A missing one renders as a raw identifier in the dialog, which is how
        # "duplicate_hostname" would reach a user as literally that.
        flow = (PACKAGE / "config_flow.py").read_text(encoding="utf-8")
        used = set(re.findall(r'reason="([a-z_]+)"', flow))
        used |= set(re.findall(r'errors\["base"\] = "([a-z_]+)"', flow))
        available = set(strings["config"]["abort"]) | set(strings["config"]["error"])
        assert used <= available

    def test_every_knob_failure_reason_has_a_message(self, strings):
        # These reach a person as a dialog when a knob write is refused, and
        # they are the difference between "MQTT is not set up" and a shrug.
        # The two modules that produce them are not the one that holds them.
        knobs = (PACKAGE / "knobs.py").read_text(encoding="utf-8")
        produced = set(re.findall(r'return "([a-z_]+)"', knobs))
        produced |= set(re.findall(r'KnobWriteUnavailable\("([a-z_]+)"\)', knobs))

        number = (PACKAGE / "number.py").read_text(encoding="utf-8")
        produced |= set(re.findall(r'or "([a-z_]+)"', number))

        # A regex that stops matching would make this pass by finding nothing.
        assert len(produced) >= 7
        assert produced <= set(strings["exceptions"])

    def test_every_translation_key_used_by_an_entity_has_a_string(self, strings):
        # `_attr_translation_key` / `translation_key=` with nothing behind it
        # gives the entity no name at all.
        declared: set[str] = set()
        for module in PACKAGE.glob("*.py"):
            source = module.read_text(encoding="utf-8")
            declared |= set(re.findall(r'translation_key="([a-z_]+)"', source))
            declared |= set(re.findall(r'_attr_translation_key = "([a-z_]+)"', source))

        available: set[str] = set()
        for platform in strings.get("entity", {}).values():
            available |= set(platform)

        assert declared <= available

    def test_every_icon_belongs_to_an_entity_that_exists(self, strings):
        # icons.json is keyed by translation key, and a key nothing uses is not
        # an error anywhere — it just silently shows no icon. Same for a
        # platform name that does not match one this integration provides.
        icons = read_json(PACKAGE / "icons.json")

        for platform, entries in icons.get("entity", {}).items():
            assert platform in strings["entity"], f"icons.json names platform {platform}"
            for key in entries:
                assert key in strings["entity"][platform], (
                    f"icons.json has {platform}.{key}, which no entity declares"
                )

    def test_the_brand_icons_are_there_and_are_pngs(self):
        # Without these a custom integration shows the generic puzzle piece.
        # They live in brand/ because that is where Home Assistant looks since
        # 2026.3; both themes, because the mark is near-black.
        brand = PACKAGE / "brand"
        for name in ("icon.png", "icon@2x.png", "dark_icon.png", "dark_icon@2x.png"):
            path = brand / name
            assert path.is_file(), f"{name} is missing"
            assert path.read_bytes()[:8] == b"\x89PNG\r\n\x1a\n", f"{name} is not a PNG"

    def test_the_repair_issue_has_a_title_and_a_flow(self, strings):
        # Raised with `translation_key=RETAINED_ISSUE`, a constant rather than a
        # literal, so the scan above cannot see it. Without these strings the
        # issue renders as a bare identifier and its fix button has no text.
        from patternflow.const import RETAINED_ISSUE

        issue = strings.get("issues", {}).get(RETAINED_ISSUE)
        assert issue is not None
        assert issue.get("title")
        assert issue["fix_flow"]["step"]["confirm"]["description"]


def _keys(node: dict, prefix: str = "") -> set[str]:
    """Every dotted key path in a nested dict."""
    found: set[str] = set()
    for key, value in node.items():
        found.add(prefix + key)
        if isinstance(value, dict):
            found |= _keys(value, f"{prefix}{key}.")
    return found
