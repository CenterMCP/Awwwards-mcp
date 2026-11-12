FROM node:24-bookworm-slim

ENV NODE_ENV=production \
    PLAYWRIGHT_BROWSERS_PATH=/opt/playwright \
    FFMPEG_BIN=/usr/bin/ffmpeg \
    AWWWARDS_CACHE_DIR=/home/node/.awwwards-mcp

WORKDIR /app

COPY package.json package-lock.json ./
# Browser and recording tools import playwright and ffmpeg-static at runtime.
# ffmpeg-static reuses FFMPEG_BIN when it exists, avoiding its GitHub download.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && npm ci --include=dev \
    && node --input-type=module -e 'import ffmpeg from "ffmpeg-static"; import { execFileSync } from "node:child_process"; execFileSync(ffmpeg, ["-version"], { stdio: "inherit" });' \
    && npx playwright install-deps chromium \
    && npm cache clean --force \
    && rm -rf /var/lib/apt/lists/*

# Cache packages separately from the large browser download, which can stall.
ARG PLAYWRIGHT_DOWNLOAD_CONNECTION_TIMEOUT=180000
RUN npx playwright install chromium

COPY tsconfig.json ./
COPY src ./src
RUN npm run build \
    && rm -rf src \
    && mkdir -p /home/node/.awwwards-mcp \
    && chown node:node /home/node/.awwwards-mcp

USER node

ENTRYPOINT ["node", "dist/cli.js"]
