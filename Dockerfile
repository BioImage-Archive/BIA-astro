FROM node:lts-alpine

WORKDIR /app

# cache node_modules layer
COPY ./package*.json ./
RUN npm install

COPY . .
RUN npm run build

EXPOSE 8080
CMD ["npm", "run", "prod"]
