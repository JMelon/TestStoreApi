FROM node:14-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --only=production

COPY . .

USER node
EXPOSE 4000
CMD ["node", "index.js"]