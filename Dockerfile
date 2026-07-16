FROM node:22-slim

RUN corepack enable && corepack prepare pnpm@10.10.0 --activate

WORKDIR /app

# Install dependencies (cached layer)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
RUN pnpm install --frozen-lockfile --ignore-scripts
RUN cd node_modules/@railway/cli && node npm-install/postinstall.js

# Copy source and build the client
COPY . .
RUN pnpm build

# Create data directories for agent workspaces / logs / saves
RUN mkdir -p /app/ag /app/workspace

# Persistent volumes — mount these in Railway (or docker run -v) to survive redeployments
# /app/ag       → user save files, session logs, agent metadata (file mode)
# /app/workspace → agent working directories (files agents create/edit/upload)
VOLUME ["/app/ag", "/app/workspace"]

EXPOSE 3001

ENV PORT=3001
ENV NODE_ENV=production

CMD ["pnpm", "exec", "tsx", "server/index.ts"]
