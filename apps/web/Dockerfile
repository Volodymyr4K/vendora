# syntax=docker/dockerfile:1
FROM node:20-slim AS base

WORKDIR /app

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm --filter @vendora/web build

FROM node:20-slim AS runner

WORKDIR /app/apps/web
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Next.js standalone runtime (no pnpm/corepack needed)
COPY --from=base /app/apps/web/.next/standalone /app
COPY --from=base /app/apps/web/.next/static /app/apps/web/.next/static
COPY --from=base /app/apps/web/public /app/apps/web/public

EXPOSE 3000
CMD ["node","server.js"]
