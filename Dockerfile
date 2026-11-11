FROM node:20-bookworm-slim

WORKDIR /app

COPY server/package*.json ./server/
RUN npm ci --omit=dev --prefix ./server

COPY server ./server
COPY public ./public
COPY shared ./shared
COPY database ./database

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "server/server.js"]
