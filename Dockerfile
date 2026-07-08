FROM node:22-slim

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Install dependencies (cached layer)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
RUN pnpm install --frozen-lockfile

# Copy source and build the client
COPY . .
RUN pnpm build

# Create data directory for agent workspaces / logs / saves
RUN mkdir -p /app/ag

EXPOSE 3001

ENV PORT=3001
ENV NODE_ENV=production

CMD ["pnpm", "exec", "tsx", "server/index.ts"]
