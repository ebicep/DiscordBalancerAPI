# Build stage: full deps + tsc
FROM node:lts-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Runtime: production deps only + compiled JS
FROM node:lts-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
# Secrets and config: pass via environment (e.g. docker run -e / compose env_file), not baked into the image.
CMD ["node", "dist/index.js"]
