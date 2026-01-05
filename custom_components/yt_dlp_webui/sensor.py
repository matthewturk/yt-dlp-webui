import logging
import aiohttp
from datetime import timedelta
from homeassistant.components.sensor import SensorEntity
from homeassistant.helpers.event import async_track_time_interval

from .const import DOMAIN, CONF_HOST, CONF_PORT

_LOGGER = logging.getLogger(__name__)
SCAN_INTERVAL = timedelta(seconds=30)


async def async_setup_platform(hass, config, async_add_entities, discovery_info=None):
    """Set up the yt-dlp WebUI sensors."""
    # Note: In a real integration we'd use config_entry, but for simplicity
    # we're using the host/port from the base config if available.
    # This is a simplified setup.
    conf = hass.data.get(DOMAIN, {})
    host = conf.get("host")
    port = conf.get("port")

    if not host:
        # Try to get from discovery or global config if async_setup saved it
        # For this demo, we'll assume it's passed via hass.data
        return

    async_add_entities(
        [
            YtDlpQueueSensor(host, port, "Active", "active"),
            YtDlpQueueSensor(host, port, "Pending", "pending"),
        ],
        True,
    )


class YtDlpQueueSensor(SensorEntity):
    """Representation of a yt-dlp Queue Sensor."""

    def __init__(self, host, port, name, key):
        self._host = host
        self._port = port
        self._key = key
        self._attr_name = f"yt-dlp {name} Downloads"
        self._attr_native_value = 0
        self._attr_extra_state_attributes = {}

    async def async_update(self):
        """Fetch new state data for the sensor."""
        url = f"http://{self._host}:{self._port}/api/queue"
        async with aiohttp.ClientSession() as session:
            try:
                async with session.get(url) as response:
                    if response.status == 200:
                        data = await response.json()
                        if self._key == "active":
                            self._attr_native_value = 1 if data.get("active") else 0
                            self._attr_extra_state_attributes = data.get("active") or {}
                        else:
                            pending = data.get("pending", [])
                            self._attr_native_value = len(pending)
                            self._attr_extra_state_attributes = {"queue": pending}
            except Exception as ex:
                _LOGGER.error("Error updating yt-dlp sensor: %s", ex)
