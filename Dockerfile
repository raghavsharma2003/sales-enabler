# syntax=docker/dockerfile:1
# Node 24 is required for node:sqlite; build and runtime use the same Debian family.
FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build
RUN ./node_modules/.bin/esbuild scripts/bootstrap-db.ts --bundle --platform=node --format=cjs --packages=external --outfile=dist/bootstrap-db.cjs \
 && ./node_modules/.bin/esbuild scripts/automation-worker.ts --bundle --platform=node --format=cjs --packages=external --outfile=dist/automation-worker.cjs \
 && ./node_modules/.bin/esbuild scripts/readiness.ts --bundle --platform=node --format=cjs --packages=external --outfile=dist/readiness.cjs \
 && ./node_modules/.bin/esbuild scripts/voice-gateway.ts --bundle --platform=node --format=cjs --packages=external --outfile=dist/voice-gateway.cjs \
 && ./node_modules/.bin/esbuild scripts/private-voice-supervisor.ts --bundle --platform=node --format=cjs --packages=external --outfile=dist/private-voice-supervisor.cjs \
 && ./node_modules/.bin/esbuild scripts/channel-worker.ts --bundle --platform=node --format=cjs --packages=external --outfile=dist/channel-worker.cjs \
 && ./node_modules/.bin/esbuild scripts/learning-worker.ts --bundle --platform=node --format=cjs --packages=external --outfile=dist/learning-worker.cjs

FROM dependencies AS production-dependencies
RUN npm prune --omit=dev

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000 AUTOMATION_WORKER_ENABLED=0 CHANNEL_WORKER_ENABLED=0 LEARNING_WORKER_ENABLED=0
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 3000

FROM runtime AS worker
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
HEALTHCHECK --interval=30s --timeout=20s --start-period=30s --retries=3 CMD ["node", "dist/readiness.cjs", "--worker"]
CMD ["sh", "-c", "node dist/readiness.cjs --config-only && exec node dist/automation-worker.cjs"]

FROM runtime AS channel-worker
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
HEALTHCHECK --interval=30s --timeout=20s --start-period=30s --retries=3 CMD ["node", "dist/readiness.cjs", "--channel-worker"]
CMD ["sh", "-c", "node dist/readiness.cjs --config-only && exec node dist/channel-worker.cjs"]

FROM runtime AS learning-worker
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
HEALTHCHECK --interval=30s --timeout=20s --start-period=30s --retries=3 CMD ["node", "dist/readiness.cjs", "--learning-worker"]
CMD ["sh", "-c", "node dist/readiness.cjs --config-only && exec node dist/learning-worker.cjs"]

FROM runtime AS voice-gateway
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
ENV PUBLIC_VOICE_GATEWAY_HOST=0.0.0.0 PUBLIC_VOICE_GATEWAY_PORT=3001
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:3001/health',{signal:AbortSignal.timeout(4000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["sh", "-c", "node dist/readiness.cjs --config-only && exec node dist/voice-gateway.cjs"]

# Build this target in Azure ACR/CI. It runs continuously without HTTP ingress;
# private voice admission checks its dedicated, fresh database heartbeat.
FROM runtime AS private-voice-supervisor
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
CMD ["sh", "-c", "node dist/readiness.cjs --config-only && exec node dist/private-voice-supervisor.cjs"]

FROM runtime AS web
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/dist/bootstrap-db.cjs ./dist/bootstrap-db.cjs
HEALTHCHECK --interval=30s --timeout=20s --start-period=40s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health?ready=1',{signal:AbortSignal.timeout(18000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
# exec ensures SIGTERM reaches Next; the bounded bootstrap only creates missing tables.
CMD ["sh", "-c", "node dist/bootstrap-db.cjs && exec node server.js"]
