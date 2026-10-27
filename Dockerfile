# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS build

WORKDIR /app

# better-sqlite3 can compile its native addon if a prebuilt binary is unavailable.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY services/api-gateway/package.json ./services/api-gateway/package.json
COPY services/department-service/package.json ./services/department-service/package.json
COPY services/ticket-service/package.json ./services/ticket-service/package.json
RUN npm ci

COPY . .
ARG SERVICE_NAME
RUN npm run build --workspace "$SERVICE_NAME" \
    && npm prune --omit=dev \
    && mkdir -p /app/scripts

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/services ./services
COPY --from=build /app/proto ./proto
COPY --from=build /app/docker ./docker
COPY --from=build /app/scripts ./scripts

RUN mkdir -p /data && chown node:node /data
USER node

ARG SERVICE_NAME
WORKDIR /app/services/${SERVICE_NAME}
CMD ["node", "dist/main.js"]
