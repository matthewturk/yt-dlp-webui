#!/usr/bin/with-contenv bashio

export DENO_INSTALL="/root/.deno"
export PATH="$DENO_INSTALL/bin:$PATH"

bashio::log.info "Starting yt-dlp WebUI (v1.0.27)..."

# Debug information
bashio::log.info "Deno version: $(deno --version | head -n 1 || echo 'Not found')"
bashio::log.info "Node version: $(node --version | head -n 1 || echo 'Not found')"
bashio::log.info "Python version: $(python3 --version | head -n 1 || echo 'Not found')"
bashio::log.info "FFmpeg version: $(ffmpeg -version | head -n 1 || echo 'Not found')"
bashio::log.info "FFprobe version: $(ffprobe -version | head -n 1 || echo 'Not found')"

# Check if yt-dlp can find a JS interpreter
if ! deno --version >/dev/null 2>&1 && ! node --version >/dev/null 2>&1; then
    bashio::log.warning "No JavaScript interpreter (Deno or Node) found. YouTube downloads might be limited."
fi

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

# Get allowed_locations and normalize to array of objects
if bashio::config.has_value 'allowed_locations'; then
    # Use bashio::config to get the raw value and pipe it through jq for normalization
    # We do this carefully to handle potential bashio output quirks
    RAW_LOCS=$(bashio::config 'allowed_locations')
    bashio::log.info "Raw locations from HA: $RAW_LOCS"
    
    # We use jq -s (slurp) to handle cases where bashio returns multiple JSON objects on separate lines
    # Then we flatten it to ensure we have a single array of objects.
    LOCATIONS_JSON=$(echo "$RAW_LOCS" | jq -s -c 'map(if type == "array" then .[] else . end)' 2>/dev/null)
    
    if [ -z "$LOCATIONS_JSON" ] || [ "$LOCATIONS_JSON" == "[]" ]; then
        bashio::log.warning "Failed to parse locations as JSON, using default"
        LOCATIONS_JSON='[{"name": "Downloads", "path": "/share/downloads"}]'
    fi
else
    LOCATIONS_JSON='[{"name": "Downloads", "path": "/share/downloads"}]'
fi

bashio::log.info "Normalized locations: $LOCATIONS_JSON"

# Construct the final config file
jq -n \
  --arg yt_dlp "$YT_DLP_PATH" \
  --arg hist "$HISTORY_PATH" \
  --argjson locs "$LOCATIONS_JSON" \
  --arg extra "$EXTRA_ARGS" \
  '{
    yt_dlp_path: $yt_dlp,
    history_path: $hist,
    allowed_locations: $locs,
    extra_args: $extra
  }' > /app/webui_config.json

bashio::log.info "Configuration file created at /app/webui_config.json"
bashio::log.info "Final allowed_locations: $(jq -c '.allowed_locations' /app/webui_config.json)"

# Start the application
cd /app
if [ -f build/index.js ]; then
    bashio::log.info "Starting web server..."
    exec node build/index.js
else
    bashio::log.error "Build not found!"
    exit 1
fi
