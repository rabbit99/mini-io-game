# Multi-stage Dockerfile for mini-io-game (Fly.io)
FROM node:20-alpine AS build
WORKDIR /app
# Install deps first (better layer caching)
COPY package*.json ./
RUN npm ci
# Copy source
COPY . .
# Build production bundle (hash + size report)
RUN npm run build:prod

# Runtime image
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=3000
# Copy only needed runtime artifacts
COPY --from=build /app/package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist/server ./dist/server
COPY --from=build /app/public ./public
COPY --from=build /app/dist/meta ./dist/meta
# Optional: non-root user
RUN addgroup -S app && adduser -S app -G app
USER app
EXPOSE 3000
CMD ["node","dist/server/server.js"]
