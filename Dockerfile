FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production DB_PATH=/data/teamhub.db PORT=3000
COPY package*.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --omit=dev -w server && mkdir /data && chown node:node /data
COPY server/src server/src
COPY --from=build /app/web/dist web/dist
USER node
VOLUME /data
EXPOSE 3000
HEALTHCHECK CMD wget -qO- http://localhost:3000/healthz || exit 1
CMD ["node", "--disable-warning=ExperimentalWarning", "server/src/index.ts"]
