import { createServer } from 'node:http';
import cors from 'cors';
import express from 'express';
import { Server } from 'socket.io';
import { MAX_CODE_BYTES, MAX_STDIN_BYTES } from '../../src/code/execution';
import { ExecutionService, createRunnerFromEnv } from './execution/ExecutionService';
import { executionRouter } from './execution/router';
import { filesRouter } from './files/router';
import { files, isAdmitted, registerSignalingHandlers, type CollabServer } from './SignalingServer';

const PORT = Number(process.env.PORT ?? 4000);
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? '*';

const app = express();
app.use(cors({ origin: CORS_ORIGIN }));
// Generous enough for a source file and its input, small enough to be no target.
app.use(express.json({ limit: MAX_CODE_BYTES + MAX_STDIN_BYTES + 4096 }));

const execution = new ExecutionService(createRunnerFromEnv());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'collab-signaling', sandbox: execution.sandbox });
});
app.use(executionRouter(execution));
app.use(filesRouter({ store: files, membership: isAdmitted }));

const httpServer = createServer(app);
const io: CollabServer = new Server(httpServer, {
  cors: { origin: CORS_ORIGIN },
});

registerSignalingHandlers(io, execution);

httpServer.listen(PORT, () => {
  console.info(`Collab signaling server listening on port ${PORT}`);
});
