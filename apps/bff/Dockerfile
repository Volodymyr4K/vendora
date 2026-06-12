# syntax=docker/dockerfile:1
FROM node:20-slim AS base

WORKDIR /app

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
RUN apt-get update -y && apt-get install -y openssl

# Prisma generate requires DATABASE_URL to be set (dummy is fine at build time)
ARG DATABASE_URL="postgresql://user:pass@localhost:5432/db?schema=public"
ENV DATABASE_URL=$DATABASE_URL

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/bff/package.json apps/bff/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/database/prisma packages/database/prisma
COPY packages/shared/package.json packages/shared/package.json
COPY packages/tenant-resolver/package.json packages/tenant-resolver/package.json

RUN pnpm install --frozen-lockfile

COPY . .

# Build workspace deps that are imported at runtime
RUN pnpm --filter @vendora/contracts --filter @vendora/shared --filter @vendora/tenant-resolver --filter @vendora/database build

RUN pnpm --filter @vendora/bff build

# Create a minimal production bundle for BFF (no pnpm/corepack needed at runtime)
FROM base AS deploy
RUN pnpm --filter @vendora/bff deploy --prod /out \
  && test -f /out/dist/index.js

FROM node:20-slim AS runner

WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update -y && apt-get install -y openssl

COPY --from=deploy /out /app

EXPOSE 4000
CMD ["node","--experimental-specifier-resolution=node","--import","./dist/instrumentation.js","dist/index.js"]
