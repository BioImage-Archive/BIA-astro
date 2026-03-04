FROM node:lts-alpine

WORKDIR /app

# cache node_modules layer
COPY ./package*.json ./
RUN npm install

COPY . .

EXPOSE 8080
CMD ["sh", "-c", "npm run build && npm run prod"]