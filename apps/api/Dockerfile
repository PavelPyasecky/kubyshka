FROM node:24-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN npm ci --omit=dev --workspace @kubyshka/api --include-workspace-root

COPY packages/shared packages/shared
COPY apps/api apps/api

ENV NODE_ENV=production
WORKDIR /app/apps/api
EXPOSE 3000
CMD ["node", "src/index.ts"]
