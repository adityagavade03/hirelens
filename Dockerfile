FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
ENV MONGOMS_DISABLE_POSTINSTALL=1
RUN npm ci
COPY . .
RUN npm run setup:assets && npm run build

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4000
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
COPY --from=build --chown=node:node /app/.data/ocr ./.data/ocr
USER node
EXPOSE 4000
CMD ["npm", "start"]
