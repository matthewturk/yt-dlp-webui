# yt-dlp WebUI

A simple web interface for `yt-dlp` built with SvelteKit and Skeleton UI.

## Features

- Simple URL-based downloads.
- Advanced options for format selection and custom naming.
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

## Security

- The app validates that all downloads are saved within the `allowed_locations`.
- `config.json` is stored in the root directory and is not served by the web server.
