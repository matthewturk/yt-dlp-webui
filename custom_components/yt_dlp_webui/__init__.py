import logging
import voluptuous as vol
import aiohttp
from homeassistant.core import HomeAssistant
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.typing import ConfigType

from .const import DOMAIN, CONF_HOST, CONF_PORT, DEFAULT_PORT

_LOGGER = logging.getLogger(__name__)

CONFIG_SCHEMA = vol.Schema(
    {
        DOMAIN: vol.Schema(
            {
                vol.Required(CONF_HOST): cv.string,
                vol.Optional(CONF_PORT, default=DEFAULT_PORT): cv.port,
            }
        )
    },
    extra=vol.ALLOW_EXTRA,
)

SERVICE_DOWNLOAD = "download"
ATTR_URL = "url"
ATTR_LOCATION = "location"
ATTR_AUDIO_ONLY = "audio_only"
ATTR_FORCE = "force"

SERVICE_DOWNLOAD_SCHEMA = vol.Schema(
    {
        vol.Required(ATTR_URL): cv.string,
        vol.Optional(ATTR_LOCATION): cv.string,
        vol.Optional(ATTR_AUDIO_ONLY, default=False): cv.boolean,
        vol.Optional(ATTR_FORCE, default=False): cv.boolean,
    }
)


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Set up the yt-dlp WebUI integration."""
    conf = config.get(DOMAIN)
    if not conf:
        return True

    host = conf[CONF_HOST]
    port = conf[CONF_PORT]
    base_url = f"http://{host}:{port}"

    # Store config for other platforms (sensors)
    hass.data[DOMAIN] = {"host": host, "port": port}

    async def handle_download(call):
        """Handle the download service call."""
        url = call.data.get(ATTR_URL)
        location = call.data.get(ATTR_LOCATION)
        audio_only = call.data.get(ATTR_AUDIO_ONLY)
        force = call.data.get(ATTR_FORCE)

        payload = {
            "urls": [url],
            "options": {
                "locationName": location,
                "audioOnly": audio_only,
                "force": force,
                "advanced": True,
            },
        }

        async with aiohttp.ClientSession() as session:
            try:
                async with session.post(
                    f"{base_url}/api/download", json=payload
                ) as response:
                    if response.status == 200:
                        _LOGGER.info("Successfully queued download for %s", url)
                    else:
                        _LOGGER.error(
                            "Failed to queue download: %s", await response.text()
                        )
            except Exception as ex:
                _LOGGER.error("Error connecting to yt-dlp WebUI: %s", ex)

    hass.services.async_register(
        DOMAIN, SERVICE_DOWNLOAD, handle_download, schema=SERVICE_DOWNLOAD_SCHEMA
    )

    return True
