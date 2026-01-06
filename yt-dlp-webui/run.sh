#!/usr/bin/with-contenv bashio

bashio::log.info "Starting yt-dlp WebUI (v1.0.15)..."

# Read options from HA
YT_DLP_PATH=$(bashio::config 'yt_dlp_path' 'yt-dlp')
HISTORY_PATH=$(bashio::config 'history_path' '/data/history.json')
EXTRA_ARGS=$(bashio::config 'extra_args' '')
AUTO_UPDATE=$(bashio::config 'auto_update' 'true')

if [ "$AUTO_UPDATE" = "true" ]; then
    bashio::log.info "Checking for yt-dlp updates..."
    pip install --no-cache-dir --break-system-packages --root-user-action=ignore -U yt-dlp || bashio::log.warning "Failed to update yt-dlp"
fi

bashio::log.info "Generating application configuration..."

# Get allowed_locations. Bashio returns JSON for lists of objects.
ALLOWED_LOCATIONS=$(bashio::config 'allowed_locations')
if [ -z "$ALLOWED_LOCATIONS" ] || [ "$ALLOWED_LOCATIONS" == "null" ]; then
    ALLOWED_LOCATIONS="[]"
fi

bashio::log.info "Configured locations: $ALLOWED_LOCATIONS"

# Construct the config.json
# We use --argjson for the locations because they are already a JSON string from bashio
CONFIG_JSON=$(jq -n \
  --arg yt_dlp "$YT_DLP_PATH" \
  --arg hist "$HISTORY_PATH" \
  --argjson locs "$ALLOWED_LOCATIONS" \
  --arg extra "$EXTRA_ARGS" \
  '{
    yt_dlp_path: $yt_dlp,
    history_path: $hist,
    allowed_locations: $locs,
    extra_args: $extra
  }' 2>/tmp/jq_error)

if [ $? -ne 0 ]; then
    bashio::log.error "Failed to generate config JSON! Error: $(cat /tmp/jq_error)"
    exit 1
fi

echo "$CONFIG_JSON" > /app/webui_config.json
bashio::log.info "Configuration file created at /app/webui_config.json"

# Verify build artifacts
if [ ! -f /app/build/index.js ]; then
    bashio::log.error "SvelteKit build artifacts not found at /app/build/index.js"
    bashio::log.info "Directory content of /app/build:"
    ls -R /app/build || echo "Build directory not found"
    exit 1
fi

bashio::log.info "Starting web server at port 3000..."
cd /app
exec node build/index.js
