# Signaling server image. Build from the repository root:
#   docker build -f server/Dockerfile -t collab-signaling .
FROM node:20-alpine

WORKDIR /app

# tsx is a dev dependency, so install everything before switching to production mode.
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
ENV NODE_ENV=production

# The server shares the event contract with the client (src/signaling/events.ts).
COPY tsconfig.json ./
COPY src/signaling ./src/signaling
COPY server ./server

EXPOSE 4000
CMD ["npx", "tsx", "server/src/index.ts"]
