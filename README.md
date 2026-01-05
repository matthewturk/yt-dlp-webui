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

1. Navigate to the application directory:

   ```bash
   cd yt_dlp_webui
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Ensure `yt-dlp` is installed on your system. You can configure the path in `config.json`.

4. Configure allowed download locations in `config.json`.

5. Run the development server:
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

## Home Assistant Support

This project is designed to integrate deeply with Home Assistant.

### 1. Home Assistant Add-on

The `yt_dlp_webui/` directory contains the configuration for running this app as a Home Assistant Add-on.

**Installation:**

1. Add this repository URL to your Home Assistant Add-on Store (Supervisor -> Add-on Store -> Three dots -> Repositories).
2. Search for "yt-dlp WebUI" and click Install.
3. Configure your `allowed_locations` and other settings in the Add-on configuration tab.
   - **yt_dlp_path**: Path to the executable (default: `yt-dlp`).
   - **history_path**: Where to store download history (default: `/data/history.json`).
   - **allowed_locations**: List of names and paths for downloads.
   - **extra_args**: List of additional command-line arguments for `yt-dlp`.
   - **auto_update**: Boolean to automatically update `yt-dlp` to the latest version on every add-on startup (default: `true`).
4. Start the add-on.
5. Use the "Open Web UI" button to access the interface via Ingress.

### Handling Private Repositories

If your GitHub repository is private, Home Assistant cannot access it via the standard "Add Repository" method without authentication. You have two options:

#### Option A: Use a Personal Access Token (PAT)

When adding the repository URL in Home Assistant, use the following format:
`https://YOUR_GITHUB_USERNAME:YOUR_PERSONAL_ACCESS_TOKEN@github.com/YOUR_USERNAME/yt-dlp-webui`

#### Option B: Local Add-on Installation

1. Enable the **Samba share** or **SSH** add-on in Home Assistant to access your HA file system.
2. Create a folder named `addons/yt_dlp_webui` in your Home Assistant configuration directory.
3. Copy the contents of the `yt_dlp_webui/` folder into that directory.
4. Go to the Add-on Store and click **Check for updates** (top right menu).
5. The add-on will appear under a new "Local" section.

### 2. Home Assistant Integration (Custom Component)

The `custom_components/yt_dlp_webui` folder provides a native integration for Home Assistant.

**Installation:**

1. Copy the `custom_components/yt_dlp_webui` folder to your Home Assistant `config/custom_components/` directory.
2. Add the following to your `configuration.yaml`:
   ```yaml
   yt_dlp_webui:
     host: "localhost" # Use the IP of your HA instance if running as an add-on
     port: 5173
   ```
3. Restart Home Assistant.

**Exposed Entities:**

- `sensor.yt_dlp_active_downloads`: Number of currently downloading tasks.
- `sensor.yt_dlp_queued_downloads`: Number of tasks waiting in the queue.

**Services:**

- `yt_dlp_webui.download`: Queue a new download.
  - `url` (Required): The video or playlist URL.
  - `location` (Optional): The name of the location (e.g., "Movies").
  - `audio_only` (Optional): Boolean to extract audio only.
  - `force` (Optional): Boolean to force re-download even if in history.

**Example Automation:**

```yaml
alias: "Download YouTube Video from Notification"
trigger:
  - platform: event
    event_type: mobile_app_notification_action
    event_data:
      action: "DOWNLOAD_VIDEO"
action:
  - service: yt_dlp_webui.download
    data:
      url: "{{ trigger.event.data.url }}"
      location: "Default"
```

## Security

- The app validates that all downloads are saved within the `allowed_locations`.
- `config.json` is stored in the application directory and is not served by the web server.
