import { io, type Socket } from 'socket.io-client';
import type { FileAttachment } from '../files/attachments';
import { postFile, type UploadableFile, type UploadProgress } from '../files/upload';
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

class SocketChannel implements SignalingChannel {
  private readonly socket: CollabSocket;
  private readonly raw: RawSocket;

  constructor(
    private readonly url: string,
    private readonly options: SignalingOptions,
  ) {
    this.socket = io(url, {
      transports: ['websocket'],
      autoConnect: false,
      reconnectionAttempts: 5,
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
      this.socket.once('connect_error', () => reject(new SignalingUnavailableError(this.url)));
      this.socket.once('room:joined', () => resolve());
      this.socket.once('room:denied', () => reject(new AdmissionDeniedError()));
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

  disconnect(): void {
    this.socket.disconnect();
  }
}

export function createSocketSignaling(url: string): SignalingFactory {
  return (options) => new SocketChannel(url, options);
}
