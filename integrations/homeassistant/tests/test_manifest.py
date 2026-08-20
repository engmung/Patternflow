"""Checks on the integration's metadata.

Home Assistant validates all of this with `hassfest` when an integration lives
in core. A custom integration in a monorepo subdirectory does not get that for
free, and every one of these mistakes is invisible until someone tries to
install it — so they are checked here instead.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

PACKAGE = Path(__file__).parent.parent / "custom_components" / "patternflow"

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
