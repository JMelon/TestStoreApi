FROM node:18.20.6-alpine3.21

WORKDIR /app

COPY package*.json ./
RUN npm install --only=production

COPY . .

USER node
EXPOSE 5000
CMD ["node", "index.js"]