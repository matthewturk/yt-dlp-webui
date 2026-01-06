ARG BUILD_FROM=ghcr.io/home-assistant/amd64-base:latest
FROM $BUILD_FROM

# Install requirements
RUN apk add --no-cache \
    nodejs \
    npm \
    python3 \
    py3-pip \
    ffmpeg \
    jq \
    quickjs

# Install yt-dlp
RUN pip install --no-cache-dir --break-system-packages yt-dlp

# Set up the web app
WORKDIR /app
COPY . .
RUN npm install && npm run build

# Environment variables for adapter-node
ENV PORT=3000
ENV HOST=0.0.0.0

# Entrypoint script
COPY run.sh /
RUN chmod a+x /run.sh

CMD [ "/run.sh" ]
