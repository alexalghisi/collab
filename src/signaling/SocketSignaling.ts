import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, PeerState, ServerToClientEvents } from './events';
import type { SignalingChannel, SignalingFactory } from './SignalingChannel';

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
    url: string,
    private readonly roomId: string,
    private readonly displayName: string,
    private readonly state: PeerState,
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
      this.socket.once('connect_error', reject);
      this.socket.once('room:joined', () => resolve());
      this.socket.once('connect', () => {
        this.socket.emit('room:join', {
          roomId: this.roomId,
          displayName: this.displayName,
          state: this.state,
        });
      });
      this.socket.connect();
    });
  }

  disconnect(): void {
    this.socket.disconnect();
  }
}

export function createSocketSignaling(url: string): SignalingFactory {
  return ({ roomId, displayName, state }) => new SocketChannel(url, roomId, displayName, state);
}
