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

# The server imports shared modules from src/ (signaling contract, code runner,
# ICE/TURN config, timeouts, ...). Copy all of src/ so a new shared import can
# never crash the image on boot: a crashed image keeps Render on the previous
# build, which served no /ice route and left calls on STUN only (no audio).
COPY tsconfig.json ./
COPY src ./src
COPY server ./server

EXPOSE 4000
CMD ["npx", "tsx", "server/src/index.ts"]
