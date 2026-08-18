FROM node:20-slim AS build

WORKDIR /app
# corepack viene con node 20. Se fija la versión que generó el lockfile: sin
# --activate, pnpm se resuelve a la que traiga la imagen y --frozen-lockfile
# puede rechazar un lockfile que no entiende.
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY . .
RUN pnpm run build

FROM node:20-slim
RUN npm i -g serve
WORKDIR /app
COPY --from=build /app/dist ./dist
CMD ["serve", "-s", "dist", "-l", "8080"]
