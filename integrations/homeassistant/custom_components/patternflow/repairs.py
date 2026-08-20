"""Repair flows.

One issue, and it is fixable in the strict sense: the thing that is wrong is a
retained MQTT message, and the fix is one publish. Offering the button rather
than instructions matters here because the problem is invisible — a panel that
restarts its pattern every few minutes with nothing in any log — and the fix is
a command most people would have to look up.
"""

from __future__ import annotations

from typing import Any

import voluptuous as vol
from homeassistant.components.repairs import RepairsFlow
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResult


async def async_create_fix_flow(
    hass: HomeAssistant, issue: str, data: dict[str, Any] | None
) -> RepairsFlow:
    """Build the flow for an issue this integration raised."""
    return RetainedCommandsRepairFlow(data or {})


class RetainedCommandsRepairFlow(RepairsFlow):
    """Offers to clear the retained messages that keep re-commanding the panel."""

    def __init__(self, data: dict[str, Any]) -> None:
        """Remember which entry raised this."""
        self._entry_id = str(data.get("entry_id", ""))

    async def async_step_init(self, user_input: dict[str, str] | None = None) -> FlowResult:
        """Go straight to the confirmation — there is nothing to choose."""
        return await self.async_step_confirm()

    async def async_step_confirm(self, user_input: dict[str, str] | None = None) -> FlowResult:
        """Clear the retained messages once the person says so.

        Deliberately behind a button rather than done automatically: these
        topics live on a broker that may be shared, and deleting a retained
        message somebody else set is not a decision this integration should
        take on its own.
        """
        entry = self.hass.config_entries.async_get_entry(self._entry_id)
        coordinator = getattr(entry, "runtime_data", None) if entry else None
        watcher = getattr(coordinator, "retained", None)

        if user_input is not None:
            if watcher is not None:
                await watcher.async_clear()
            return self.async_create_entry(data={})

        topics = sorted(watcher.found) if watcher is not None else []
        return self.async_show_form(
            step_id="confirm",
            data_schema=vol.Schema({}),
            description_placeholders={"topics": "\n".join(f"- {t}" for t in topics) or "-"},
        )
