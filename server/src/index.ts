import { createServer } from 'node:http';
import cors from 'cors';
import express from 'express';
import { Server } from 'socket.io';
import { registerSignalingHandlers, type CollabServer } from './SignalingServer';

const PORT = Number(process.env.PORT ?? 4000);
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? '*';

const app = express();
app.use(cors({ origin: CORS_ORIGIN }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'collab-signaling' });
});

const httpServer = createServer(app);
const io: CollabServer = new Server(httpServer, {
  cors: { origin: CORS_ORIGIN },
});

registerSignalingHandlers(io);

httpServer.listen(PORT, () => {
  console.info(`Collab signaling server listening on port ${PORT}`);
});
