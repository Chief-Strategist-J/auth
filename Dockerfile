FROM node:26-alpine AS deps
WORKDIR /app
COPY package*.json tsconfig*.json ./
RUN npm install --no-audit --no-fund

FROM node:26-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package*.json tsconfig*.json ./
COPY src ./src
COPY contracts ./contracts
RUN npx tsc

FROM node:26-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=builder /app/dist ./dist
USER node
EXPOSE 3001
CMD ["node", "dist/server.js"]
