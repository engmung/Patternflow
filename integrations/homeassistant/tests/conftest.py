"""Test fixtures.

The tests here deliberately do not need Home Assistant installed. They cover the
two modules most likely to be wrong and cheapest to check — the REST client and
the pure translations — so that `pytest` is a fast, dependency-light gate. Entity
and config-flow behaviour needs the full harness
(`pytest-homeassistant-custom-component`); that is a follow-up, and its absence
is why nothing here imports `homeassistant`.
"""

from __future__ import annotations

import json
import sys
import types
from pathlib import Path
from typing import Any

import pytest

PACKAGE = Path(__file__).parent.parent / "custom_components" / "patternflow"

# Register `patternflow` as a package WITHOUT running its __init__, which
# imports Home Assistant. Submodules then resolve normally — `api` finds
# `.const`, and neither pulls in the harness — so `pytest` runs against a bare
# interpreter with aiohttp. Importing the package for real is Home Assistant's
# job, and testing that it does so correctly needs Home Assistant.
if "patternflow" not in sys.modules:
    _package = types.ModuleType("patternflow")
    _package.__path__ = [str(PACKAGE)]
    sys.modules["patternflow"] = _package

FIXTURES = Path(__file__).parent / "fixtures"


def load_fixture(name: str) -> dict[str, Any]:
    """Read one recorded device response."""
    return json.loads((FIXTURES / f"{name}.json").read_text(encoding="utf-8"))


@pytest.fixture
def status() -> dict[str, Any]:
    """A healthy device's /api/status."""
    return load_fixture("status")


@pytest.fixture
def patterns() -> dict[str, Any]:
    """A device with one preset and two modules."""
    return load_fixture("patterns")


@pytest.fixture
def mqtt() -> dict[str, Any]:
    """/api/mqtt with no broker configured — knobs still readable."""
    return load_fixture("mqtt")
