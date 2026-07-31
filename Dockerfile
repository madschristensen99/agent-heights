FROM node:22-slim

# Install Python + pip for Hermes Agent gateway (messaging platform integration)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-venv \
    bubblewrap \
  && rm -rf /var/lib/apt/lists/*

# Install Hermes Agent
# Install Hermes Agent with messaging extra (Telegram, Discord, Slack, etc.)
# The extra is called "messaging" not "telegram" per pyproject.toml
RUN pip3 install --no-cache-dir --break-system-packages 'hermes-agent[messaging]'
# Belt-and-suspenders: directly install python-telegram-bot in case the extra doesn't resolve
RUN pip3 install --no-cache-dir --break-system-packages 'python-telegram-bot[webhooks]>=22.6,<23'

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
RUN pnpm build:all

# Create data directory for agent workspaces / logs / saves
# All persistent data lives under /app/ag — mount it as a volume in Railway
# Persist Hermes config (credentials, .env, config.yaml) inside the ag volume so they survive redeploys
# rm -rf first because pip install may have created /root/.hermes as a real directory
RUN mkdir -p /app/ag /app/ag/hermes && \
    rm -rf /root/.hermes && \
    ln -s /app/ag/hermes /root/.hermes

# Hermes gateway port
EXPOSE 3001 9119

ENV PORT=3001
ENV NODE_ENV=production
# Hermes gateway auto-started by the Node server as a child process
ENV HERMES_BASE_URL=http://127.0.0.1:9119
# Explicit HERMES_HOME on the persistent volume so credentials survive redeploy
ENV HERMES_HOME=/app/ag/hermes

CMD ["pnpm", "exec", "tsx", "server/index.ts"]
