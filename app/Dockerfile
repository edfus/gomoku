FROM node:16-alpine
COPY --chown=node:node . /app
WORKDIR /app

RUN chmod -R 765 /app/
RUN npm install

USER node

CMD [ "node", "index.js" ]