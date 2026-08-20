"""Config and options flow for Patternflow."""

from __future__ import annotations

import logging
from typing import Any

import voluptuous as vol
from homeassistant.config_entries import (
    ConfigFlow,
    ConfigFlowResult,
    OptionsFlow,
)
from homeassistant.const import CONF_HOST
from homeassistant.core import callback
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.service_info.zeroconf import ZeroconfServiceInfo

from .api import PatternflowClient, PatternflowError, PatternflowNotFound
from .const import (
    CONF_ENABLE_KNOBS,
    CONF_SCAN_INTERVAL,
    DEFAULT_HOST,
    DEFAULT_SCAN_INTERVAL,
    DOMAIN,
    MAX_SCAN_INTERVAL,
    MIN_SCAN_INTERVAL,
    ROLE_SUBSCRIBER,
)
from .coordinator import PatternflowConfigEntry
from .helpers import looks_like_patternflow

_LOGGER = logging.getLogger(__name__)


class PatternflowConfigFlow(ConfigFlow, domain=DOMAIN):
    """Add a device, by discovery or by hand."""

    VERSION = 1

    def __init__(self) -> None:
        """Start with nothing discovered."""
        self._host: str | None = None
        self._unique_id: str | None = None
        self._mqtt: dict[str, Any] | None = None

    async def _async_finish(self) -> ConfigFlowResult:
        """Create the entry, after offering knob control if it is one step away.

        The offer is only made when it would actually change something: the
        device already has a broker, and is simply not in the role that obeys
        knob topics. With no broker there is nothing this flow can fix — the
        device has to be pointed at one from its own /mqtt page first — and
        asking about it here would be a dead end with an explanation attached.
        """
        if (
            self._mqtt
            and self._mqtt.get("configured")
            and self._mqtt.get("role") != ROLE_SUBSCRIBER
            and not self._mqtt.get("forcesSub")
        ):
            return await self.async_step_knob_control()

        return self.async_create_entry(title="Patternflow", data={CONF_HOST: self._host})

    async def async_step_knob_control(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Offer to put the device in the role where knob writes are obeyed."""
        if user_input is not None:
            if user_input.get(CONF_ENABLE_KNOBS):
                client = PatternflowClient(async_get_clientsession(self.hass), self._host or "")
                try:
                    await client.set_mqtt_role(ROLE_SUBSCRIBER)
                except PatternflowError:
                    # Not fatal. Everything else works, and the role can be
                    # changed later from the device's own /mqtt page.
                    _LOGGER.warning("Could not switch %s to Subscriber", self._host)
            return self.async_create_entry(title="Patternflow", data={CONF_HOST: self._host})

        return self.async_show_form(
            step_id="knob_control",
            data_schema=vol.Schema({vol.Required(CONF_ENABLE_KNOBS, default=False): bool}),
            description_placeholders={
                "role": str((self._mqtt or {}).get("role", "off")),
                "broker": str((self._mqtt or {}).get("host", "")),
            },
        )

    async def _async_probe(self, host: str) -> str:
        """Confirm a Patternflow device is at `host` and return its unique id.

        The mDNS records carry nothing Patternflow-specific — `_http._tcp` has
        no TXT records at all and `_arduino._tcp` only ArduinoOTA's own — so the
        only way to know what answered is to ask it.

        Raises PatternflowError when nothing usable is there.
        """
        client = PatternflowClient(async_get_clientsession(self.hass), host)
        status = await client.get_status()

        if not looks_like_patternflow(status):
            raise PatternflowError("that is not a Patternflow device")

        # Read once, here, so the flow knows whether knob control is one
        # question away or not available at all. Absent on a PF_MQTT_ENABLED 0
        # build, which is a fine device with no knob writing.
        try:
            self._mqtt = await client.get_mqtt()
        except PatternflowNotFound:
            self._mqtt = None

        # There is no MAC, serial or other hardware identifier on any endpoint.
        # The mDNS hostname is what is left: unique in practice, because two
        # boards answering to one name cannot both be resolved anyway, and
        # net_config.h already asks people to change it for a second device.
        reported = status.get("host")
        return str(reported).strip() if reported else host

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        """Add a device by hostname or IP."""
        errors: dict[str, str] = {}

        if user_input is not None:
            host = str(user_input[CONF_HOST]).strip()
            try:
                unique_id = await self._async_probe(host)
            except PatternflowError:
                errors["base"] = "cannot_connect"
            else:
                await self.async_set_unique_id(unique_id)

                # Deliberately NOT updating the existing entry's host here.
                # Two boards on default hostnames would otherwise mean adding
                # the second silently repoints the first entry at it, and the
                # only symptom is one device in Home Assistant controlling the
                # other. Discovery may update a host; a person typing one may
                # not.
                for entry in self._async_current_entries():
                    if entry.unique_id != unique_id:
                        continue
                    if entry.data.get(CONF_HOST) == host:
                        return self.async_abort(reason="already_configured")
                    return self.async_abort(reason="duplicate_hostname")

                self._host = host
                return await self._async_finish()

        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema(
                {
                    vol.Required(
                        CONF_HOST,
                        default=(user_input or {}).get(CONF_HOST, DEFAULT_HOST),
                    ): str
                }
            ),
            errors=errors,
        )

    async def async_step_zeroconf(self, discovery_info: ZeroconfServiceInfo) -> ConfigFlowResult:
        """Handle a device found over mDNS.

        Two service types reach this: `_http._tcp` (advertised whenever the
        browser self-update is compiled in) and `_arduino._tcp` (ArduinoOTA).
        A default build has both, so the same device usually arrives twice —
        the unique id sorts that out.
        """
        # Prefer the mDNS name over the address it currently resolves to: the
        # address is DHCP and moves, the name is what the device answers to and
        # is also what the user already types.
        hostname = (discovery_info.hostname or "").rstrip(".")
        host = hostname or discovery_info.host

        try:
            unique_id = await self._async_probe(host)
        except PatternflowError:
            return self.async_abort(reason="cannot_connect")

        await self.async_set_unique_id(unique_id)
        # Discovery is allowed to move an entry to a new address: mDNS resolved
        # this name to this host, which is the authority on where it lives.
        self._abort_if_unique_id_configured(updates={CONF_HOST: host})

        self._host = host
        self._unique_id = unique_id
        self.context["title_placeholders"] = {"name": unique_id}
        return await self.async_step_zeroconf_confirm()

    async def async_step_zeroconf_confirm(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Ask before adding a discovered device."""
        if user_input is not None:
            return await self._async_finish()

        return self.async_show_form(
            step_id="zeroconf_confirm",
            description_placeholders={"host": self._host or ""},
        )

    @staticmethod
    @callback
    def async_get_options_flow(entry: PatternflowConfigEntry) -> OptionsFlow:
        """Options are just the poll interval."""
        return PatternflowOptionsFlow()


class PatternflowOptionsFlow(OptionsFlow):
    """How often to poll — the one thing worth tuning per install."""

    async def async_step_init(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        """Set the poll interval."""
        if user_input is not None:
            return self.async_create_entry(data=user_input)

        current = self.config_entry.options.get(CONF_SCAN_INTERVAL, DEFAULT_SCAN_INTERVAL)
        return self.async_show_form(
            step_id="init",
            data_schema=vol.Schema(
                {
                    vol.Required(CONF_SCAN_INTERVAL, default=current): vol.All(
                        vol.Coerce(int),
                        vol.Range(min=MIN_SCAN_INTERVAL, max=MAX_SCAN_INTERVAL),
                    )
                }
            ),
        )
