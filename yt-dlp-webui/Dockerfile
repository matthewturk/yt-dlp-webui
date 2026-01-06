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
    curl \
    unzip \
    libstdc++ \
    libc6-compat \
    gcompat

# Install Deno
RUN curl -fsSL https://deno.land/x/install/install.sh | sh && \
    ln -s /root/.deno/bin/deno /usr/local/bin/deno
ENV DENO_INSTALL="/root/.deno"
ENV PATH="$DENO_INSTALL/bin:$PATH"

# Install yt-dlp and plugins
RUN pip install --no-cache-dir --break-system-packages yt-dlp yt-dlp-ejs

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
