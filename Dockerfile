# syntax=docker/dockerfile:1

FROM node:22.13.1-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:22.13.1-bookworm-slim AS builder
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22.13.1-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/dist-worker ./dist-worker
COPY --from=builder /app/public ./public
COPY --from=builder /app/config ./config
COPY --from=builder /app/scripts/validate-env.mjs ./scripts/validate-env.mjs
COPY --from=builder /app/scripts/admin/bootstrap.mjs ./scripts/admin/bootstrap.mjs

RUN mkdir -p /var/lib/accabad/receipts /var/lib/accabad/support-attachments \
  && chown -R node:node /var/lib/accabad

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["npm", "run", "start"]
