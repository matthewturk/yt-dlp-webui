# yt-dlp WebUI

A simple web interface for `yt-dlp` built with SvelteKit and Skeleton UI.

## Features

- **Batch Downloads**: Queue up multiple URLs at once (one per line).
- **Download Queue**: Real-time progress tracking and status for active, pending, and completed tasks.
- **Playlist Support**: Toggle playlist downloads with automatic subfolder organization.
- **Audio Extraction**: Download audio-only in MP3, M4A, Opus, or WAV formats.
- **Quality Control**: Limit maximum resolution (e.g., 1080p, 720p).
- **Metadata & Thumbnails**: Embed metadata and thumbnails directly into files.
- **Sidecar Metadata**: Automatically downloads full metadata to a `.info.json` sidecar file by default.
- **Home Assistant Add-on**: Ready to be used as a Home Assistant add-on with Ingress support.
- **Home Assistant Integration**: Includes a custom component to trigger downloads from HA automations and monitor the queue.
- **API Access**: Exposes `/api/download` for adding tasks and `/api/queue` for monitoring.
- Restricted output locations defined in `config.json`.
- API endpoint for programmatic access.

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Ensure `yt-dlp` is installed on your system. You can configure the path in `config.json`.

3. Configure allowed download locations in `config.json`.

4. Run the development server:
   ```bash
   npm run dev
   ```

## Configuration

The `config.json` file contains:

- `yt_dlp_path`: Path to the `yt-dlp` executable.
- `allowed_locations`: A list of objects with `name` and `path` where downloads are permitted.

Example `config.json`:

```json
{
  "yt_dlp_path": "/usr/local/bin/yt-dlp",
  "allowed_locations": [
    { "name": "Default", "path": "/path/to/downloads" },
    { "name": "Movies", "path": "/path/to/movies" }
  ]
}
```

## Home Assistant Integration

To control the WebUI from Home Assistant:

1. Copy the `custom_components/yt_dlp_webui` folder to your HA `config/custom_components/` directory.
2. Add the following to your `configuration.yaml`:
   ```yaml
   yt_dlp_webui:
     host: "YOUR_ADDON_IP_OR_HOSTNAME"
     port: 5173
   ```
3. Restart Home Assistant.
4. Use the `yt_dlp_webui.download` service in your automations!

## Security

- The app validates that all downloads are saved within the `allowed_locations`.
- `config.json` is stored in the root directory and is not served by the web server.
