FROM node:20-alpine AS build
WORKDIR /app
COPY package.json pnpm-lock.yaml tsconfig.architecture.json ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY packages ./packages
COPY services/outbox-relay ./services/outbox-relay
RUN pnpm exec tsc -p tsconfig.architecture.json
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --prod --frozen-lockfile
COPY --from=build /app/dist-architecture ./dist-architecture
CMD ["node","dist-architecture/services/outbox-relay/src/main.js"]
