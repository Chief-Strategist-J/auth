FROM node:26-alpine AS builder

WORKDIR /app

RUN apk add --no-cache bash

COPY shared-infra /app/packages/node/shared-infra
COPY auth /app/packages/node/auth

WORKDIR /app/packages/node/shared-infra
RUN npm install --no-audit --no-fund

WORKDIR /app/packages/node/auth
RUN npm install --no-audit --no-fund

FROM node:26-alpine AS runner
WORKDIR /app/packages/node/auth

ENV NODE_ENV=production
ENV PORT=3001

COPY --chown=node:node --from=builder /app/packages/node /app/packages/node

USER node
EXPOSE 3001

CMD ["npx", "tsx", "src/server.ts"]
