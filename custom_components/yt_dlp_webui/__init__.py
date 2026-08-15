import logging
import os
from datetime import timedelta
from functools import partial
from urllib.parse import quote

import aiohttp
import voluptuous as vol

from homeassistant.core import HomeAssistant
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.event import async_track_time_interval
from homeassistant.helpers.typing import ConfigType

from .const import (
    CONF_HOST,
    CONF_MEDIA_PLAYER,
    CONF_POLL_INTERVAL,
    CONF_PORT,
    CONF_STREAM_BASE_URL,
    DEFAULT_POLL_INTERVAL,
    DEFAULT_PORT,
    DOMAIN,
    EVENT_DOWNLOAD_COMPLETED,
)

_LOGGER = logging.getLogger(__name__)

CONFIG_SCHEMA = vol.Schema(
    {
        DOMAIN: vol.Schema(
            {
                vol.Required(CONF_HOST): cv.string,
                vol.Optional(CONF_PORT, default=DEFAULT_PORT): cv.port,
                vol.Optional(CONF_MEDIA_PLAYER): cv.string,
                vol.Optional(CONF_STREAM_BASE_URL): cv.string,
                vol.Optional(
                    CONF_POLL_INTERVAL, default=DEFAULT_POLL_INTERVAL
                ): cv.positive_int,
            }
        )
    },
    extra=vol.ALLOW_EXTRA,
)

SERVICE_DOWNLOAD = "download"
SERVICE_DOWNLOAD_AUDIO = "download_audio"
SERVICE_PLAY_COMPLETED = "play_completed"

ATTR_URL = "url"
ATTR_LOCATION = "location"
ATTR_AUDIO_ONLY = "audio_only"
ATTR_AUDIO_FORMAT = "audio_format"
ATTR_FORCE = "force"
ATTR_USERNAME = "username"
ATTR_PASSWORD = "password"
ATTR_MEDIA_PLAYER = "media_player"

SERVICE_DOWNLOAD_SCHEMA = vol.Schema(
    {
        vol.Required(ATTR_URL): cv.string,
        vol.Optional(ATTR_LOCATION): cv.string,
        vol.Optional(ATTR_AUDIO_ONLY, default=False): cv.boolean,
        vol.Optional(ATTR_AUDIO_FORMAT): cv.string,
        vol.Optional(ATTR_FORCE, default=False): cv.boolean,
        vol.Optional(ATTR_MEDIA_PLAYER): cv.string,
        vol.Optional(ATTR_USERNAME): cv.string,
        vol.Optional(ATTR_PASSWORD): cv.string,
    }
)

SERVICE_DOWNLOAD_AUDIO_SCHEMA = vol.Schema(
    {
        vol.Required(ATTR_URL): cv.string,
        vol.Optional(ATTR_LOCATION): cv.string,
        vol.Optional(ATTR_AUDIO_FORMAT): cv.string,
        vol.Optional(ATTR_FORCE, default=False): cv.boolean,
        vol.Optional(ATTR_MEDIA_PLAYER): cv.string,
        vol.Optional(ATTR_USERNAME): cv.string,
        vol.Optional(ATTR_PASSWORD): cv.string,
    }
)

SERVICE_PLAY_COMPLETED_SCHEMA = vol.Schema(
    {
        vol.Required(ATTR_MEDIA_PLAYER): cv.string,
    }
)

AUDIO_MIME_TYPES = {
    ".mp3": "audio/mpeg",
    ".m4a": "audio/mp4",
    ".mp4": "audio/mp4",
    ".aac": "audio/aac",
    ".opus": "audio/ogg",
    ".ogg": "audio/ogg",
    ".oga": "audio/ogg",
    ".wav": "audio/wav",
    ".flac": "audio/flac",
    ".mka": "audio/x-matroska",
    ".webm": "audio/webm",
}


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Set up the yt-dlp WebUI integration."""
    conf = config.get(DOMAIN)
    if not conf:
        return True

    host = conf[CONF_HOST]
    port = conf[CONF_PORT]
    base_url = f"http://{host}:{port}"
    stream_base_url = conf.get(CONF_STREAM_BASE_URL, base_url)
    default_media_player = conf.get(CONF_MEDIA_PLAYER)
    poll_interval = conf.get(CONF_POLL_INTERVAL, DEFAULT_POLL_INTERVAL)

    # Store config for other platforms (sensors)
    hass.data[DOMAIN] = {
        "host": host,
        "port": port,
        "base_url": base_url,
        "stream_base_url": stream_base_url,
        "default_media_player": default_media_player,
        "locations": [],
        "completed_ids": set(),
        "play_targets": {},
        "last_completed": None,
        "available": False,
        "first_poll": True,
    }

    def stream_url_for(output_path: str) -> str:
        entry = hass.data[DOMAIN]
        encoded = quote(output_path, safe="")
        return f"{entry['stream_base_url']}/api/media?path={encoded}"

    def media_content_type_for(output_path: str) -> str:
        ext = os.path.splitext(output_path)[1].lower()
        return AUDIO_MIME_TYPES.get(ext, "audio/mpeg")

    async def play_file(media_player: str, output_path: str) -> None:
        """Stream a downloaded file to a media player entity."""
        if not media_player or not output_path:
            return
        stream_url = stream_url_for(output_path)
        content_type = media_content_type_for(output_path)
        _LOGGER.info(
            "Streaming %s to %s (%s)", output_path, media_player, stream_url
        )
        await hass.services.async_call(
            "media_player",
            "play_media",
            {
                "entity_id": media_player,
                "media_content_id": stream_url,
                "media_content_type": content_type,
            },
            blocking=False,
        )

    async def refresh_locations() -> None:
        """Fetch the acceptable download locations from the app."""
        entry = hass.data[DOMAIN]
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    f"{base_url}/api/config", timeout=aiohttp.ClientTimeout(total=10)
                ) as response:
                    if response.status == 200:
                        data = await response.json()
                        entry["locations"] = data.get("locations", [])
                        _LOGGER.debug(
                            "Loaded yt-dlp locations: %s", entry["locations"]
                        )
        except Exception as ex:
            _LOGGER.warning("Failed to load yt-dlp locations: %s", ex)

    async def handle_completed(task: dict) -> None:
        """Process a newly completed download task."""
        entry = hass.data[DOMAIN]
        task_id = task.get("id")
        url = task.get("url")
        output_path = task.get("outputPath") or task.get("outputFile")

        options = task.get("options") or {}
        location = options.get("locationName")

        media_player = entry["play_targets"].pop(task_id, None)
        if not media_player:
            media_player = entry["default_media_player"]

        entry["last_completed"] = {
            "task_id": task_id,
            "url": url,
            "output_path": output_path,
            "location": location,
            "media_player": media_player,
            "audio_only": bool(options.get("audioOnly")),
        }

        hass.bus.async_fire(
            EVENT_DOWNLOAD_COMPLETED,
            {
                "task_id": task_id,
                "url": url,
                "output_path": output_path,
                "location": location,
                "media_player": media_player,
            },
        )

        _LOGGER.info(
            "yt-dlp download completed: %s -> %s", url, output_path
        )

        if media_player and output_path:
            await play_file(media_player, output_path)

    async def poll_queue(now=None) -> None:
        """Poll the yt-dlp WebUI queue for completed downloads."""
        entry = hass.data[DOMAIN]
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    f"{base_url}/api/queue", timeout=aiohttp.ClientTimeout(total=10)
                ) as response:
                    if response.status != 200:
                        raise OSError(f"Unexpected status {response.status}")
                    data = await response.json()
        except Exception as ex:
            entry["available"] = False
            _LOGGER.debug("yt-dlp WebUI unreachable: %s", ex)
            return

        entry["available"] = True
        completed = data.get("completed", []) or []

        # On the first poll, only seed the seen-ids set so downloads that
        # finished before this integration started are not re-processed.
        if entry["first_poll"]:
            entry["first_poll"] = False
            for task in completed:
                if task.get("id"):
                    entry["completed_ids"].add(task["id"])

        for task in completed:
            task_id = task.get("id")
            if not task_id or task_id in entry["completed_ids"]:
                continue
            entry["completed_ids"].add(task_id)
            if task.get("status") == "completed":
                await handle_completed(task)

    async def submit_download(call, *, force_audio_only: bool = False) -> None:
        """Queue a download on the yt-dlp WebUI."""
        entry = hass.data[DOMAIN]
        url = call.data.get(ATTR_URL)
        location = call.data.get(ATTR_LOCATION)
        media_player = call.data.get(ATTR_MEDIA_PLAYER) or entry[
            "default_media_player"
        ]

        # Streaming to a media player implies audio.
        audio_only = force_audio_only or bool(media_player) or call.data.get(
            ATTR_AUDIO_ONLY, False
        )
        force = call.data.get(ATTR_FORCE, False)
        username = call.data.get(ATTR_USERNAME)
        password = call.data.get(ATTR_PASSWORD)
        audio_format = call.data.get(ATTR_AUDIO_FORMAT)

        payload = {
            "urls": [url],
            "options": {
                "locationName": location,
                "audioOnly": audio_only,
                "force": force,
                "advanced": True,
                "embedMetadata": audio_only,
            },
        }
        if audio_format:
            payload["options"]["audioFormat"] = audio_format
        # Only include credentials if provided (never log them)
        if username:
            payload["options"]["username"] = username
        if password:
            payload["options"]["password"] = password

        task_id = None
        async with aiohttp.ClientSession() as session:
            try:
                async with session.post(
                    f"{base_url}/api/download", json=payload
                ) as response:
                    if response.status == 200:
                        data = await response.json()
                        tasks = data.get("tasks") or []
                        if tasks:
                            task_id = tasks[0].get("id")
                        _LOGGER.info(
                            "Queued download for %s (audio_only=%s)",
                            url,
                            audio_only,
                        )
                    else:
                        _LOGGER.error(
                            "Failed to queue download: %s", await response.text()
                        )
            except Exception as ex:
                _LOGGER.error("Error connecting to yt-dlp WebUI: %s", ex)

        if task_id and media_player:
            entry["play_targets"][task_id] = media_player

    async def handle_play_completed(call) -> None:
        """Stream the most recently completed download to a media player."""
        media_player = call.data.get(ATTR_MEDIA_PLAYER)
        last_completed = hass.data[DOMAIN]["last_completed"]
        if not last_completed or not last_completed.get("output_path"):
            _LOGGER.error("No completed yt-dlp download available to play")
            return
        await play_file(
            media_player, last_completed["output_path"]
        )

    hass.services.async_register(
        DOMAIN,
        SERVICE_DOWNLOAD,
        partial(submit_download, force_audio_only=False),
        schema=SERVICE_DOWNLOAD_SCHEMA,
    )
    hass.services.async_register(
        DOMAIN,
        SERVICE_DOWNLOAD_AUDIO,
        partial(submit_download, force_audio_only=True),
        schema=SERVICE_DOWNLOAD_AUDIO_SCHEMA,
    )
    hass.services.async_register(
        DOMAIN,
        SERVICE_PLAY_COMPLETED,
        handle_play_completed,
        schema=SERVICE_PLAY_COMPLETED_SCHEMA,
    )

    await refresh_locations()
    await poll_queue()
    async_track_time_interval(hass, poll_queue, timedelta(seconds=poll_interval))

    return True
