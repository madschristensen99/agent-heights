FROM node:22-slim

# Install Python + pip for Hermes Agent gateway (messaging platform integration)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-venv \
  && rm -rf /var/lib/apt/lists/*

# Install Hermes Agent
RUN pip3 install --no-cache-dir --break-system-packages hermes-agent

RUN corepack enable && corepack prepare pnpm@10.10.0 --activate

WORKDIR /app

# Install dependencies (cached layer)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
RUN pnpm install --frozen-lockfile --ignore-scripts
RUN cd node_modules/@railway/cli && node npm-install/postinstall.js

# Install Chromium for Playwright (agent browser feature)
RUN npx playwright install chromium

# Copy source and build the client
COPY . .
RUN pnpm build

# Create data directories for agent workspaces / logs / saves
# Persist Hermes config (credentials, .env) inside the ag volume so they survive redeploy
RUN mkdir -p /app/ag /app/workspace /app/ag/hermes && \
    ln -sf /app/ag/hermes /root/.hermes

# Hermes gateway port
EXPOSE 3001 9119

ENV PORT=3001
ENV NODE_ENV=production
# Hermes gateway auto-started by the Node server as a child process
ENV HERMES_BASE_URL=http://127.0.0.1:9119

CMD ["pnpm", "exec", "tsx", "server/index.ts"]
