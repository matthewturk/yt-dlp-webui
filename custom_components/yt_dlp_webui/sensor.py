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
    conf = hass.data.get(DOMAIN, {})
    host = conf.get("host")
    port = conf.get("port")

    if not host:
        return

    async_add_entities(
        [
            YtDlpQueueSensor(host, port, "Active", "active"),
            YtDlpQueueSensor(host, port, "Pending", "pending"),
            YtDlpLastCompletedSensor(),
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


class YtDlpLastCompletedSensor(SensorEntity):
    """Sensor exposing the most recently completed audio download.

    The value is populated by the integration's queue poller, so this
    sensor needs no direct access to the WebUI.
    """

    def __init__(self):
        self._attr_name = "yt-dlp Last Completed Audio"
        self._attr_native_value = "None"
        self._attr_extra_state_attributes = {}

    async def async_update(self):
        """Read the latest completed download from integration data."""
        entry = self.hass.data.get(DOMAIN, {})
        last_completed = entry.get("last_completed")
        if not last_completed or not last_completed.get("output_path"):
            self._attr_native_value = "None"
            self._attr_extra_state_attributes = {}
            return

        output_path = last_completed["output_path"]
        file_name = output_path.rsplit("/", 1)[-1]

        self._attr_native_value = file_name
        self._attr_extra_state_attributes = {
            "url": last_completed.get("url"),
            "output_path": output_path,
            "location": last_completed.get("location"),
            "media_player": last_completed.get("media_player"),
            "task_id": last_completed.get("task_id"),
            "audio_only": last_completed.get("audio_only", True),
        }
