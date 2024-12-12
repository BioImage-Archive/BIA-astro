FROM node:lts-alpine

WORKDIR /app

# cache node_modules layer
COPY ./package*.json ./
RUN npm install
RUN export NODE_OPTIONS=--max_old_space_size=4096

COPY . .
RUN npm run build

EXPOSE 8080
ENTRYPOINT ["npm", "run", "astro", "preview", "--", "--base", "/bioimage-archive", "--host", "0.0.0.0", "--port", "8080"]
