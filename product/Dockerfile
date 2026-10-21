# syntax=docker/dockerfile:1
# VP control plane: one Node process serving the API (/v1, /hooks) and the built web app.
# Build from the repo root:  docker build -f product/Dockerfile -t vp-control .
# Migrations are a separate step:  docker run --rm -e DATABASE_URL=... vp-control node product/scripts/migrate.mjs
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY product ./product
RUN if [ -f product/web/build.mjs ]; then node product/web/build.mjs; fi

FROM deps AS prod-deps
RUN npm prune --omit=dev

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY package.json ./
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/product ./product
RUN rm -rf product/tests product/web/dev product/web/shots product/voice
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--import", "tsx", "product/server/main.ts"]
