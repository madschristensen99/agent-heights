# Dockerfile for self-hosting capitol-api
# Source: https://github.com/crnicholson/capitol-api
# Free, open-source API for US House PTR (Periodic Transaction Report) data.
# Fetches from disclosures-clerk.house.gov — no API key, no auth needed.

FROM node:20-slim

WORKDIR /app

# Clone capitol-api
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*
RUN git clone https://github.com/crnicholson/capitol-api.git .

# Install dependencies
RUN npm install

# Default env — fetch current + previous year
ENV PORT=3000
ENV YEARS_START=2025
ENV YEARS_END=2026
ENV CACHE_REFRESH_HOURS=6
ENV FETCH_DELAY_MS=500

EXPOSE 3000

CMD ["npm", "start"]
