# Keep this tag in sync with the Playwright version in package-lock.json.
FROM mcr.microsoft.com/playwright:v1.63.0-noble

ENV NODE_ENV=production \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
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
    && npm cache clean --force \
    && rm -rf /var/lib/apt/lists/*

COPY tsconfig.json ./
COPY src ./src
RUN npm run build \
    && rm -rf src \
    && mkdir -p /home/node/.awwwards-mcp \
    && chown pwuser:pwuser /home/node/.awwwards-mcp

USER pwuser
ENV HOME=/home/pwuser

# Verify bundled browsers work as the runtime user without accessing the network.
RUN node --input-type=module -e 'import { chromium } from "playwright"; const browser = await chromium.launch(); try { const page = await browser.newPage(); await page.setContent("<h1>Browser check</h1>"); await page.screenshot(); } finally { await browser.close(); }'

ENTRYPOINT ["node", "dist/cli.js"]
