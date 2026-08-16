FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server ./server
COPY src ./src

ENV PORT=80
EXPOSE 80

CMD ["node", "server/index.js"]
