# LivePost — run anywhere with Node 18+
FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

# Install production deps first (better layer caching)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# App code (data/ is a volume — see the RUN command below)
COPY server ./server
COPY public ./public

# Persisted credentials + post history
VOLUME ["/app/data"]
ENV DATA_DIR=/app/data

EXPOSE 3000
CMD ["node", "server/index.js"]
