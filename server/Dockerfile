FROM node:24-slim

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
# Fly.io injects PORT for the http service; default keeps local parity.
EXPOSE 8787

CMD ["node", "index.js"]
