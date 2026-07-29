FROM node:20-slim AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install --ignore-scripts
COPY . .
RUN npm run build

FROM node:20-slim
RUN npm i -g serve
WORKDIR /app
COPY --from=build /app/dist ./dist
CMD ["serve", "-s", "dist", "-l", "8080"]
