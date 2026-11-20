# --- build web ---
FROM node:22-alpine AS web-build
WORKDIR /app/web
COPY web/package.json ./
RUN npm install
COPY web/ ./
RUN npm run build

# --- build server ---
FROM node:22-alpine AS server-build
RUN apk add --no-cache openssl
WORKDIR /app/server
COPY server/package.json ./
RUN npm install
COPY server/ ./
RUN npx prisma generate
RUN npm run build

# --- runtime ---
FROM node:22-alpine AS runtime
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production
ENV WEB_DIST_PATH=/app/web-dist

COPY --from=server-build /app/server/package.json ./server/package.json
COPY --from=server-build /app/server/node_modules ./server/node_modules
COPY --from=server-build /app/server/dist ./server/dist
COPY --from=server-build /app/server/prisma ./server/prisma
COPY --from=web-build /app/web/dist ./web-dist

WORKDIR /app/server
EXPOSE 4000
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
