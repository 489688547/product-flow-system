FROM node:22-bookworm-slim AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production \
    HOME=/tmp \
    PFS_RUNTIME_PORT=8080 \
    PFS_WRANGLER_PERSIST_DIR=/var/lib/product-flow/wrangler \
    PFS_RUNTIME_ENV_FILE=/run/pfs/runtime.env \
    PFS_WRANGLER_CONFIG=/app/deploy/aliyun/wrangler.toml \
    PFS_ASSETS_DIR=/app/dist \
    PFS_WRANGLER_BIN=/app/node_modules/.bin/wrangler

WORKDIR /app
COPY --from=build --chown=node:node /app /app
RUN mkdir -p /var/lib/product-flow/wrangler /run/pfs \
    && chown -R node:node /var/lib/product-flow /run/pfs

USER node
EXPOSE 8080
CMD ["node", "scripts/aliyun/start-runtime.mjs"]
