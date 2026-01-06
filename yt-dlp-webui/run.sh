#!/usr/bin/with-contenv bashio
set -e

bashio::log.info "Starting yt-dlp WebUI..."

# Read options from HA
YT_DLP_PATH=$(bashio::config 'yt_dlp_path' 'yt-dlp')
HISTORY_PATH=$(bashio::config 'history_path' '/data/history.json')
EXTRA_ARGS=$(bashio::config 'extra_args' '')
AUTO_UPDATE=$(bashio::config 'auto_update' 'true')

# Suppress pip root warning and update if requested
if [ "$AUTO_UPDATE" = "true" ]; then
    bashio::log.info "Checking for yt-dlp updates..."
    # Suppress root warning with --root-user-action=ignore
    pip install --no-cache-dir --break-system-packages --root-user-action=ignore -U yt-dlp || bashio::log.warning "Failed to update yt-dlp"
fi

bashio::log.info "Generating application configuration..."

# Safely extract allowed_locations to a file
if bashio::config.has_value 'allowed_locations'; then
    bashio::config 'allowed_locations' > /tmp/locations.json
else
    echo "[]" > /tmp/locations.json
fi

# Validate it's proper JSON
if ! jq -e . /tmp/locations.json > /dev/null 2>&1; then
    bashio::log.warning "Invalid or empty 'allowed_locations'. Using default []."
    echo "[]" > /tmp/locations.json
fi

# Construct the config.json using --slurpfile for the array and --arg for strings
# This is the most bulletproof way to use jq with shell variables
jq -n \
  --arg yt_dlp "$YT_DLP_PATH" \
  --arg hist "$HISTORY_PATH" \
  --arg extra "$EXTRA_ARGS" \
  --slurpfile locs /tmp/locations.json \
  '{
    yt_dlp_path: $yt_dlp,
    history_path: $hist,
    allowed_locations: $locs[0],
    extra_args: $extra
  }' > /app/webui_config.json

rm /tmp/locations.json

bashio::log.info "Config generated successfully."
bashio::log.info "Starting web server..."

cd /app
node build
