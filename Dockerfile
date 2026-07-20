# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS base

ENV NEXT_TELEMETRY_DISABLED=1 \
  NODE_OPTIONS=--max-old-space-size=4096
WORKDIR /app

RUN apt-get update \
  && apt-get install --no-install-recommends -y ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

FROM base AS dependencies

COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder

COPY --from=dependencies /app/node_modules ./node_modules
COPY . .

ARG NEXT_PUBLIC_APP_URL=https://bracket-iq.com
ARG NEXT_PUBLIC_SITE_URL=https://bracket-iq.com
ARG NEXT_PUBLIC_WEB_BASE_URL=https://bracket-iq.com
ARG NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
ARG NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN
ARG NEXT_PUBLIC_MVP_ANDROID_DEEP_LINK
ARG NEXT_PUBLIC_MVP_ANDROID_PLAY_STORE_URL
ARG NEXT_PUBLIC_MVP_IOS_APP_STORE_URL
ARG NEXT_PUBLIC_MVP_IOS_DEEP_LINK

ENV DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build \
  NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL} \
  NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL} \
  NEXT_PUBLIC_WEB_BASE_URL=${NEXT_PUBLIC_WEB_BASE_URL} \
  NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=${NEXT_PUBLIC_GOOGLE_MAPS_API_KEY} \
  NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID=${NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID} \
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=${NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY} \
  NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN=${NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN} \
  NEXT_PUBLIC_MVP_ANDROID_DEEP_LINK=${NEXT_PUBLIC_MVP_ANDROID_DEEP_LINK} \
  NEXT_PUBLIC_MVP_ANDROID_PLAY_STORE_URL=${NEXT_PUBLIC_MVP_ANDROID_PLAY_STORE_URL} \
  NEXT_PUBLIC_MVP_IOS_APP_STORE_URL=${NEXT_PUBLIC_MVP_IOS_APP_STORE_URL} \
  NEXT_PUBLIC_MVP_IOS_DEEP_LINK=${NEXT_PUBLIC_MVP_IOS_DEEP_LINK}

RUN npm run build

FROM node:22-bookworm-slim AS runner

ENV NODE_ENV=production \
  NEXT_TELEMETRY_DISABLED=1 \
  NODE_OPTIONS=--max-old-space-size=2560 \
  PORT=8080 \
  HOSTNAME=0.0.0.0
WORKDIR /app

RUN apt-get update \
  && apt-get install --no-install-recommends -y ca-certificates curl openssl \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs --home-dir /app nextjs

COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
  && npm cache clean --force

COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/src/generated/prisma ./src/generated/prisma
COPY --from=builder --chown=nextjs:nodejs /app/src/content ./src/content
COPY --from=builder --chown=nextjs:nodejs /app/server.mjs ./server.mjs
COPY --from=builder --chown=nextjs:nodejs /app/next.config.mjs ./next.config.mjs
COPY --from=builder --chown=nextjs:nodejs /app/prisma.config.ts ./prisma.config.ts

RUN mkdir -p /app/.next/cache \
  && chown -R nextjs:nodejs /app/.next/cache

USER nextjs
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD curl --fail --silent --show-error http://127.0.0.1:8080/api/health/live >/dev/null || exit 1

CMD ["node", "server.mjs"]
