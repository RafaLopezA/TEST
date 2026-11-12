# La ejecución directa de TypeScript sin flags exige Node >= 22.18: se fija la versión menor para no depender de capas antiguas en caché.
ARG NODE_IMAGE=node:22.22-alpine
FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY package*.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci
COPY . .
RUN npm run build

FROM ${NODE_IMAGE}
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
