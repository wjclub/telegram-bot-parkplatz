# syntax=docker/dockerfile:1

FROM docker.io/node:24-alpine AS base

FROM base AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm clean-install

COPY tsconfig.json ./
COPY src/ ./src/
RUN npx tsc

FROM base AS production
WORKDIR /app

COPY --chown=node:node package.json package-lock.json ./
RUN npm clean-install --omit=dev

COPY --chown=node:node --from=builder /app/build/ ./build/
COPY --chown=node:node locales/ ./locales/

USER node
ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "./build/index.js"]