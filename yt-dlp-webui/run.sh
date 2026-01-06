#!/usr/bin/with-contenv bashio
set -e

bashio::log.info "Starting yt-dlp WebUI..."

# Read options from HA
YT_DLP_PATH=$(bashio::config 'yt_dlp_path' 'yt-dlp')
HISTORY_PATH=$(bashio::config 'history_path' '/data/history.json')
EXTRA_ARGS=$(bashio::config 'extra_args' '')
AUTO_UPDATE=$(bashio::config 'auto_update' 'true')

# Update yt-dlp if requested
if [ "$AUTO_UPDATE" = "true" ]; then
    bashio::log.info "Checking for yt-dlp updates..."
    pip install --no-cache-dir --break-system-packages --root-user-action=ignore -U yt-dlp || bashio::log.warning "Failed to update yt-dlp"
fi

bashio::log.info "Generating application configuration..."

# Safely extract allowed_locations
if bashio::config.has_value 'allowed_locations'; then
    bashio::config 'allowed_locations' > /tmp/locations.json
else
    echo "[]" > /tmp/locations.json
fi

# Ensure it's valid JSON for jq
if ! jq -e . /tmp/locations.json > /dev/null 2>&1; then
    bashio::log.warning "Invalid or empty 'allowed_locations'. Defaulting to []."
    echo "[]" > /tmp/locations.json
fi

# Construct the config.json using --slurpfile (most reliable)
jq -n \
  --arg yt_dlp "$YT_DLP_PATH" \
  --arg hist "$HISTORY_PATH" \
  --arg extra "$EXTRA_ARGS" \
  --slurpfile locs /tmp/locations.json \
  '{
    yt_dlp_path: $yt_dlp,
    history_path: $hist,
    allowed_locations: ($locs[0] // []),
    extra_args: $extra
  }' > /app/webui_config.json

rm /tmp/locations.json

bashio::log.info "Config generated. Path: /app/webui_config.json"
if [ ! -f /app/build/index.js ]; then
    bashio::log.error "Build artifacts not found! Expecting /app/build/index.js"
    exit 1
fi

bashio::log.info "Starting web server at port 3000..."
cd /app
# Use exec to ensure node is PID 1 in the sub-shell and s6 manages it correctly
exec node build/index.js
