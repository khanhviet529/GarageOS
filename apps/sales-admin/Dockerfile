# Sales Admin production image — Next.js `standalone`. Build context là repo root.
#
# 🔒 Không bake API secret/token vào `NEXT_PUBLIC_*` — chỉ origin API cho browser.
FROM node:20-alpine AS build

WORKDIR /app
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0

RUN corepack enable && corepack prepare pnpm@10.34.4 --activate
COPY . .
RUN pnpm install --frozen-lockfile && pnpm --filter @garageos/sales-admin build

FROM node:20-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3004
ENV HOSTNAME=0.0.0.0

COPY --from=build --chown=node:node /app/apps/sales-admin/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/sales-admin/.next/static ./apps/sales-admin/.next/static
COPY --from=build --chown=node:node /app/apps/sales-admin/public ./apps/sales-admin/public

USER node
EXPOSE 3004
CMD ["node", "apps/sales-admin/server.js"]
