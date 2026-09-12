import { io, type Socket } from 'socket.io-client';
import type { FileAttachment } from '../files/attachments';
import { postFile, type UploadableFile, type UploadProgress } from '../files/upload';
import { sendContactInvite } from '../meeting/sendInvite';
import type { ClientToServerEvents, ServerToClientEvents } from './events';
import {
  AdmissionDeniedError,
  SignalingUnavailableError,
  type SignalingChannel,
  type SignalingFactory,
  type SignalingOptions,
} from './SignalingChannel';

type CollabSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * socket.io's generic `on`/`emit` do not compose with our generic forwarders,
 * so forwarding goes through this untyped view. Both sides share the same
 * event maps (`events.ts`), which is what keeps the bridge sound.
 */
interface RawSocket {
  on(event: string, listener: (...args: unknown[]) => void): unknown;
  emit(event: string, ...args: unknown[]): unknown;
}

/** Loopback is either up or forgotten; a remote host may still be waking. */
function isLoopbackUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
  } catch {
    return false;
  }
}

class SocketChannel implements SignalingChannel {
  private readonly socket: CollabSocket;
  private readonly raw: RawSocket;

  constructor(
    private readonly url: string,
    private readonly options: SignalingOptions,
  ) {
    this.socket = io(url, {
      // Polling is the fallback when the first websocket upgrade is refused —
      // a preview, a proxy, or a browser that cannot hold a raw WS open.
      transports: ['websocket', 'polling'],
      autoConnect: false,
      reconnectionAttempts: 8,
      reconnectionDelay: 750,
    });
    this.raw = this.socket as unknown as RawSocket;
  }

  on: SignalingChannel['on'] = (event, handler) => {
    this.raw.on(event, handler as (...args: unknown[]) => void);
  };

  emit: SignalingChannel['emit'] = (event, payload) => {
    this.raw.emit(event, payload);
  };

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) {
          return;
        }
        settled = true;
        this.socket.off('connect_error', onError);
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      };
      const onError = () => {
        // A first refused upgrade is not the end on a remote host: Render's
        // free instances sleep, and the next attempt is the one that lands.
        // Loopback has no cold start — if nothing is listening, say so now.
        if (isLoopbackUrl(this.url) || !this.socket.active) {
          finish(new SignalingUnavailableError(this.url));
        }
      };
      this.socket.on('connect_error', onError);
      this.socket.once('room:joined', () => finish());
      this.socket.once('room:denied', () => finish(new AdmissionDeniedError()));
      this.socket.once('connect', () => {
        const { sessionId, roomId, displayName, state, breakoutOf } = this.options;
        this.socket.emit('room:join', { sessionId, roomId, displayName, state, breakoutOf });
      });
      this.socket.connect();
    });
  }

  upload(file: UploadableFile, onProgress: UploadProgress): Promise<FileAttachment> {
    const { roomId, sessionId } = this.options;
    return postFile(`${this.url}/files`, file, { roomId, sessionId }, onProgress);
  }

  sendInvite(input: string, hostName: string, link: string, inviteRoomId?: string) {
    const { sessionId } = this.options;
    return sendContactInvite(this.url, {
      contact: input,
      roomId: inviteRoomId ?? this.options.roomId,
      sessionId,
      hostName,
      link,
    });
  }

  disconnect(): void {
    this.socket.disconnect();
  }
}

export function createSocketSignaling(url: string): SignalingFactory {
  return (options) => new SocketChannel(url, options);
}
