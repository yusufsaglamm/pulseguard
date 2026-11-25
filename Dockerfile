FROM node:24-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json* ./
COPY server/package.json ./server/
COPY web/package.json ./web/
RUN npm ci

COPY server ./server
COPY web ./web
RUN npm run build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/app/data

COPY package.json package-lock.json* ./
COPY server/package.json ./server/
COPY web/package.json ./web/
RUN npm ci --omit=dev --workspace=server

COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/web/dist ./web/dist

RUN mkdir -p /app/data && chown -R node:node /app
USER node

EXPOSE 3000
VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server/dist/index.js"]
