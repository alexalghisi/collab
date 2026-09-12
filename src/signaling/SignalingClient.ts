import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from './events';

export type CollabSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export function createSignalingClient(url: string): CollabSocket {
  return io(url, {
    transports: ['websocket'],
    autoConnect: false,
    reconnectionAttempts: 5,
  });
}
