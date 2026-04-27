FROM ghcr.io/home-assistant/base:3.23

# Install requirements
RUN apk add --no-cache \
    nodejs \
    npm \
    python3 \
    py3-pip \
    ffmpeg \
    jq \
    curl \
    unzip \
    libstdc++ \
    libc6-compat \
    gcompat

# Install Deno from edge repos
RUN apk add --no-cache \
    --repository http://dl-cdn.alpinelinux.org/alpine/edge/main \
    --repository http://dl-cdn.alpinelinux.org/alpine/edge/community \
    deno

# Install yt-dlp and plugins
RUN pip install --no-cache-dir --break-system-packages yt-dlp yt-dlp-ejs

# Set up the web app
WORKDIR /app
COPY . .
RUN npm install && npx svelte-kit sync && npm run build

# Environment variables for adapter-node
ENV PORT=3000
ENV HOST=0.0.0.0

# Entrypoint script
COPY run.sh /
RUN chmod a+x /run.sh

CMD [ "/run.sh" ]

LABEL \
    org.opencontainers.image.title="yt-dlp frontend" \
    org.opencontainers.image.description="Simple frontend for yt-dlp." \
    org.opencontainers.image.source="https://github.com/matthewturk/yt-dlp-webui" \
    org.opencontainers.image.licenses="Apache License 2.0"
