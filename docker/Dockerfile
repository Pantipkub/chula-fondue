FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY services/api-gateway/package.json services/api-gateway/
COPY services/auth-service/package.json services/auth-service/
COPY services/department-service/package.json services/department-service/
COPY services/ticket-service/package.json services/ticket-service/
COPY services/notification-service/package.json services/notification-service/
COPY services/analytics-service/package.json services/analytics-service/
COPY frontend/package.json frontend/
RUN npm ci --no-audit --no-fund

FROM dependencies AS build
COPY services services
COPY proto proto
ARG SERVICE
RUN npx tsc -p services/$SERVICE

FROM dependencies AS production-dependencies
RUN npm prune --omit=dev --no-audit --no-fund

FROM node:22-alpine
ARG SERVICE
ENV NODE_ENV=production
WORKDIR /app
COPY --from=production-dependencies /app/node_modules node_modules
COPY --from=build /app/proto proto
COPY --from=build /app/services/$SERVICE/package.json services/$SERVICE/
COPY --from=build /app/services/$SERVICE/dist services/$SERVICE/dist
COPY docker/healthcheck.mjs /app/healthcheck.mjs
WORKDIR /app/services/$SERVICE
RUN mkdir uploads && chown node:node uploads
USER node
CMD ["node", "dist/main.js"]
