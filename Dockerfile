# Build stage: full deps + tsc
FROM node:lts-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Runtime: production deps only + compiled JS
FROM node:lts-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
# chartjs-node-canvas / node-canvas text needs fontconfig + fonts (slim image has neither)
RUN apt-get update \
	&& apt-get install -y --no-install-recommends fontconfig fonts-dejavu-core fonts-liberation \
	&& rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
# Secrets and config: pass via environment (e.g. docker run -e / compose env_file), not baked into the image.
CMD ["node", "dist/index.js"]
