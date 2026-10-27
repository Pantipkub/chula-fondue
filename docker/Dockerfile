# One image per service, chosen with the build argument SERVICE (see docker-compose.yml):
#   docker build -f docker/Dockerfile --build-arg SERVICE=ticket-service .
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY services/api-gateway/package.json services/api-gateway/
COPY services/auth-service/package.json services/auth-service/
COPY services/department-service/package.json services/department-service/
COPY services/notification-service/package.json services/notification-service/
COPY services/ticket-service/package.json services/ticket-service/
RUN npm ci --no-audit --no-fund
COPY proto proto
COPY services services
ARG SERVICE
RUN test -n "$SERVICE" || (echo "--build-arg SERVICE=<folder in services/> is required" && exit 1)
RUN npx tsc -p services/$SERVICE && npm prune --omit=dev --no-audit --no-fund

FROM node:22-alpine
ARG SERVICE
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/proto proto
COPY --from=build /app/services/$SERVICE/package.json services/$SERVICE/
COPY --from=build /app/services/$SERVICE/dist services/$SERVICE/dist
COPY docker/healthcheck.mjs /app/healthcheck.mjs
WORKDIR /app/services/$SERVICE
# The gateway's local photo fallback writes here; the app runs as the unprivileged "node" user.
RUN mkdir uploads && chown node:node uploads
USER node
CMD ["node", "dist/main.js"]
