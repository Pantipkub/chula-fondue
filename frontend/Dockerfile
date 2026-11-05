FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY services services
COPY frontend frontend
RUN npm ci --no-audit --no-fund && npm run build -w chula-fondue-frontend
FROM nginx:1.27-alpine
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 80
