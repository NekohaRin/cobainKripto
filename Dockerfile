
FROM node:20-bookworm-slim

WORKDIR /app

# Salin konfigurasi dependency backend
COPY server/package*.json ./server/

# Install dependency produksi
RUN npm ci --omit=dev --prefix ./server

# Salin source code aplikasi
COPY server ./server
COPY public ./public
COPY shared ./shared
COPY database ./database

ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "server/server.js"]
