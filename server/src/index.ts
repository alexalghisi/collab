import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express from 'express';
import { Server } from 'socket.io';
import { MAX_CODE_BYTES, MAX_STDIN_BYTES } from '../../src/code/execution';
import { MAX_WORKSPACE_BYTES } from '../../src/code/workspaceFiles';
import { assistantRouter } from './assistant/router';
import { searchRouter } from './assistant/searchRouter';
import { createMeetingAssistant, meetingIndexStore } from './assistant/service';
import { authRouter } from './auth/router';
import { createUserStoreFromEnv } from './auth/store';
import { verifyToken } from './auth/tokens';
import { ExecutionService, createRunnerFromEnv } from './execution/ExecutionService';
import { executionRouter } from './execution/router';
import { filesRouter } from './files/router';
import { sendAppHome } from './home';
import { ReminderBook } from './invite/reminders';
import { inviteRouter } from './invite/router';
import { transportFromEnv } from './invite/senders';
import { files, isAdmitted, registerSignalingHandlers, type CollabServer } from './SignalingServer';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

function loadDotEnv(path: string): void {
  if (!existsSync(path)) {
    return;
  }
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) {
      continue;
    }
    const eq = line.indexOf('=');
    if (eq <= 0) {
      continue;
    }
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadDotEnv(join(ROOT, '.env'));

const PORT = Number(process.env.PORT ?? 4000);
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? '*';
const WEB_ROOT = join(ROOT, 'dist-web');

const app = express();
app.use(cors({ origin: CORS_ORIGIN }));
// Generous enough for a source file and its input, small enough to be no target.
app.use(express.json({ limit: MAX_CODE_BYTES + MAX_STDIN_BYTES + MAX_WORKSPACE_BYTES + 4096 }));

const execution = new ExecutionService(createRunnerFromEnv());
const assistant = createMeetingAssistant();
const userStore = createUserStoreFromEnv(join(ROOT, 'data', 'users.json'));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'collab-signaling', sandbox: execution.sandbox });
});
if (!existsSync(join(WEB_ROOT, 'index.html'))) {
  app.get('/', sendAppHome);
}
app.use(authRouter({ store: userStore, root: ROOT }));
app.use(executionRouter(execution));
app.use(assistantRouter(assistant));
app.use(searchRouter(meetingIndexStore()));
app.use(filesRouter({ store: files, membership: isAdmitted }));
const inviteTransport = transportFromEnv();
const reminders = new ReminderBook(join(ROOT, 'data', 'reminders.json'));
reminders.start(inviteTransport);
app.use(inviteRouter({ membership: isAdmitted, transport: inviteTransport, reminders }));

if (existsSync(WEB_ROOT)) {
  app.use(
    express.static(WEB_ROOT, {
      setHeaders(res, filePath) {
        if (filePath.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-store');
        }
      },
    }),
  );
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/socket.io')) {
      next();
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(join(WEB_ROOT, 'index.html'));
  });
}

const httpServer = createServer(app);
const io: CollabServer = new Server(httpServer, {
  cors: { origin: CORS_ORIGIN },
});

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  const session = verifyToken(typeof token === 'string' ? token : undefined);
  if (session) {
    socket.data.accountName = session.displayName;
    socket.data.accountId = session.uid;
  }
  next();
});

registerSignalingHandlers(io, execution, assistant);

void userStore
  .ready()
  .catch((cause) => {
    console.error('Could not load the account store', cause);
  })
  .finally(() => {
    httpServer.listen(PORT, () => {
      console.info(`Collab signaling server listening on port ${PORT}`);
    });
  });
