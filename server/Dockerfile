# Signaling server image. Build from the repository root:
#   docker build -f server/Dockerfile -t collab-signaling .
# Node 22 so the local sandbox can strip TypeScript types at runtime.
FROM node:22-alpine

# Compilers for the local execution sandbox (JavaScript/TypeScript run on Node).
RUN apk add --no-cache python3 g++ go

WORKDIR /app

# tsx is a dev dependency, so install everything before switching to production mode.
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
ENV NODE_ENV=production
ENV EXECUTION_BACKEND=cloud

# The server shares the event contract with the client (src/signaling/events.ts)
# and the shared editor's update encoding (src/code/updates.ts).
COPY tsconfig.json ./
COPY src/signaling ./src/signaling
COPY src/code ./src/code
COPY src/chat ./src/chat
COPY src/files ./src/files
COPY src/meeting ./src/meeting
COPY src/transcript ./src/transcript
COPY src/search ./src/search
COPY src/assistant ./src/assistant
COPY server ./server

EXPOSE 4000
CMD ["npx", "tsx", "server/src/index.ts"]
