FROM node:24-bookworm-slim

ENV NODE_ENV=production \
    PLAYWRIGHT_BROWSERS_PATH=/opt/playwright \
    AWWWARDS_CACHE_DIR=/home/node/.awwwards-mcp

WORKDIR /app

COPY package.json package-lock.json ./
# Browser and recording tools import playwright and ffmpeg-static at runtime.
RUN npm ci --include=dev \
    && npx playwright install --with-deps chromium \
    && npm cache clean --force \
    && rm -rf /var/lib/apt/lists/*

COPY tsconfig.json ./
COPY src ./src
RUN npm run build \
    && rm -rf src \
    && mkdir -p /home/node/.awwwards-mcp \
    && chown node:node /home/node/.awwwards-mcp

USER node

ENTRYPOINT ["node", "dist/cli.js"]
