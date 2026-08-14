# Landing production image — Next.js `standalone`. Build context là repository
# root vì landing import workspace packages (`packages/contracts`, `packages/domain`).
#
# 🔒 Landing KHÔNG có DB credential, KHÔNG có API secret/token trong client
# bundle. `NEXT_PUBLIC_*` chỉ chứa origin công khai của browser.
FROM node:20-alpine AS build

WORKDIR /app
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0

RUN corepack enable && corepack prepare pnpm@10.34.4 --activate
COPY . .
RUN pnpm install --frozen-lockfile && pnpm --filter @garageos/landing build

FROM node:20-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3003
ENV HOSTNAME=0.0.0.0

# standalone output trong monorepo giữ nguyên đường dẫn apps/landing/
COPY --from=build --chown=node:node /app/apps/landing/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/landing/.next/static ./apps/landing/.next/static
COPY --from=build --chown=node:node /app/apps/landing/public ./apps/landing/public

USER node
EXPOSE 3003
CMD ["node", "apps/landing/server.js"]
