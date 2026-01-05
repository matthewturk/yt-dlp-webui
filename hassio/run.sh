#!/usr/bin/with-contenv bashio

# Read options from HA and write to the app's config.json
YT_DLP_PATH=$(bashio::config 'yt_dlp_path')
ALLOWED_LOCATIONS=$(bashio::config 'allowed_locations')

# Construct the config.json
echo "{
  \"yt_dlp_path\": \"$YT_DLP_PATH\",
  \"allowed_locations\": $ALLOWED_LOCATIONS
}" > /app/config.json

# Start the application
cd /app
node build
