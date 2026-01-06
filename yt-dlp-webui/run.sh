#!/usr/bin/with-contenv bashio

# Read options from HA and write to the app's config.json
YT_DLP_PATH=$(bashio::config 'yt_dlp_path' 'yt-dlp')
HISTORY_PATH=$(bashio::config 'history_path' '/data/history.json')
EXTRA_ARGS=$(bashio::config 'extra_args' '')

if bashio::config.has_value 'allowed_locations'; then
    ALLOWED_LOCATIONS=$(bashio::config 'allowed_locations')
else
    ALLOWED_LOCATIONS="[]"
fi

# Ensure ALLOWED_LOCATIONS is valid JSON for jq --argjson
if [ -z "$ALLOWED_LOCATIONS" ] || [ "$ALLOWED_LOCATIONS" == "null" ] || ! echo "$ALLOWED_LOCATIONS" | jq -e . >/dev/null 2>&1; then
    bashio::log.warning "Configuration 'allowed_locations' is missing or invalid JSON. Using default."
    ALLOWED_LOCATIONS="[]"
fi

if bashio::config.true 'auto_update'; then
    bashio::log.info "Checking for yt-dlp updates..."
    pip install --no-cache-dir --break-system-packages -U yt-dlp || bashio::log.warning "Failed to update yt-dlp"
fi

# Construct the config.json using jq for safety
jq -n \
  --arg yt_dlp_path "$YT_DLP_PATH" \
  --arg history_path "$HISTORY_PATH" \
  --argjson allowed_locations "$ALLOWED_LOCATIONS" \
  --arg extra_args "$EXTRA_ARGS" \
  '{
    yt_dlp_path: $yt_dlp_path,
    history_path: $history_path,
    allowed_locations: $allowed_locations,
    extra_args: $extra_args
  }' > /app/webui_config.json

# Start the application
cd /app
node build
