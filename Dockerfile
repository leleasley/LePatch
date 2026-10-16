FROM node:22-bookworm-slim AS base
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates util-linux psmisc postgresql-client curl

FROM base AS builder
WORKDIR /app
ARG DATABASE_URL=postgresql://lepatch:lepatch@postgres:5432/lepatch
ENV DATABASE_URL=${DATABASE_URL}
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci
COPY . .
RUN npx prisma generate
RUN npm run build
RUN npm prune --omit=dev

FROM base AS runner
WORKDIR /app
ARG DATABASE_URL=postgresql://lepatch:lepatch@postgres:5432/lepatch
ENV DATABASE_URL=${DATABASE_URL}
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/data ./data
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/src ./src
RUN mkdir -p /app/data/backups && chown -R node:node /app/data /app/.next /app/public 2>/dev/null || true
USER node
EXPOSE 3000
CMD ["npm", "start"]
