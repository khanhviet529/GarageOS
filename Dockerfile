# API production image. Build context phải là repository root vì API import
# workspace packages trong `packages/` trước khi esbuild gói chúng thành một file.
FROM node:20-alpine AS build

WORKDIR /app
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0

RUN corepack enable && corepack prepare pnpm@10.34.4 --activate
COPY . .
RUN pnpm install --frozen-lockfile && pnpm --filter @garageos/api build

# `apps/api/build.mjs` đã bundle toàn bộ dependency runtime cần thiết. Image cuối
# không mang source code, pnpm store, development dependency hay DATABASE_ADMIN_URL.
FROM node:20-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build --chown=node:node /app/apps/api/dist ./dist
USER node

EXPOSE 3001
CMD ["node", "dist/main.cjs"]
