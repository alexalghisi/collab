import { io, type Socket } from 'socket.io-client';
import type { FileAttachment } from '../files/attachments';
import { postFile, type UploadableFile, type UploadProgress } from '../files/upload';
import { readSessionToken } from '../auth/session';
import { sendContactInvite } from '../meeting/sendInvite';
import type { ClientToServerEvents, ServerToClientEvents } from './events';
import {
  AdmissionDeniedError,
  SignalingUnavailableError,
  type SignalingChannel,
  type SignalingFactory,
  type SignalingOptions,
} from './SignalingChannel';
import { isLoopbackSignalingUrl, waitUntilSignalingReady } from './wake';

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
  /** Latest state this peer announced, so a rejoin shows the room the truth. */
  private state: SignalingOptions['state'];
  private inRoom = false;

  constructor(
    private readonly url: string,
    private readonly options: SignalingOptions,
    private readonly handshakeMs: number,
  ) {
    this.socket = io(url, {
      transports: ['polling', 'websocket'],
      autoConnect: false,
      // A call outlives short network drops (Wi-Fi hand-off, a phone locking,
      // a cold Render instance), so keep trying rather than give up silently.
      reconnectionAttempts: Infinity,
      reconnectionDelay: 750,
      reconnectionDelayMax: 5000,
      auth: { token: readSessionToken() ?? '' },
    });
    this.raw = this.socket as unknown as RawSocket;
    this.state = options.state;
  }

  private joinRoom(): void {
    const { sessionId, roomId, displayName, breakoutOf } = this.options;
    this.socket.emit('room:join', {
      sessionId,
      roomId,
      displayName,
      state: this.state,
      breakoutOf,
    });
  }

  on: SignalingChannel['on'] = (event, handler) => {
    this.raw.on(event, handler as (...args: unknown[]) => void);
  };

  emit: SignalingChannel['emit'] = (event, payload) => {
    if (event === 'peer:state') {
      this.state = payload as SignalingOptions['state'];
    }
    this.raw.emit(event, payload);
  };

  async connect(): Promise<void> {
    await waitUntilSignalingReady(this.url);
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        this.socket.off('connect_error', onError);
        this.socket.off('disconnect', onDrop);
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
        if (isLoopbackSignalingUrl(this.url) || !this.socket.active) {
          finish(new SignalingUnavailableError(this.url));
        }
      };
      let holdingForHost = false;
      const onDrop = () => {
        if (holdingForHost) {
          finish(new SignalingUnavailableError(this.url));
        }
      };
      const timer = setTimeout(
        () => finish(new SignalingUnavailableError(this.url)),
        this.handshakeMs,
      );
      this.socket.on('connect_error', onError);
      this.socket.on('disconnect', onDrop);
      this.socket.once('room:joined', () => finish());
      this.socket.once('room:denied', () => finish(new AdmissionDeniedError()));
      this.socket.once('room:waiting', () => {
        holdingForHost = true;
        clearTimeout(timer);
      });
      // Every connect, not just the first: the server gives a reconnected socket
      // a new peer id and forgets the old one, so without joining again this
      // client stays online but invisible and inaudible to everyone else.
      this.socket.on('connect', () => {
        // A short drop the server recovered: same peer id, same room, and the
        // messages sent meanwhile are replayed. Joining again would announce
        // this peer as new and make everyone tear down a call that still works.
        if (this.socket.recovered && this.inRoom) {
          return;
        }
        if (!settled || this.inRoom) {
          this.joinRoom();
        }
      });
      this.socket.once('room:joined', () => {
        this.inRoom = true;
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
    this.inRoom = false;
    this.socket.disconnect();
  }
}

export function createSocketSignaling(url: string, handshakeMs = 15_000): SignalingFactory {
  return (options) => new SocketChannel(url, options, handshakeMs);
}
