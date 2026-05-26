FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache wget openssl

FROM base AS deps
COPY package.json ./
RUN npm install --omit=dev && cp -r node_modules /tmp/prod_modules
RUN npm install

FROM deps AS build
COPY . .
RUN npx prisma generate
RUN npm run build

FROM base AS production
ENV NODE_ENV=production
COPY --from=deps /tmp/prod_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY locales ./locales

EXPOSE 3001
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:3001/healthz || exit 1

CMD ["node", "dist/main.js"]
