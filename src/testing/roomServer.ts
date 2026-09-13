import { createServer } from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { Server } from 'socket.io';
import type { ExecutionService } from '../../server/src/execution/ExecutionService';
import { registerSignalingHandlers, type CollabServer } from '../../server/src/SignalingServer';
import { INITIAL_PEER_STATE, type RoomJoinedPayload } from '../signaling/events';
import type { SignalingChannel, SignalingFactory } from '../signaling/SignalingChannel';
import { createSocketSignaling } from '../signaling/SocketSignaling';

export interface RoomServer {
  readonly url: string;
  readonly io: CollabServer;
  readonly connect: SignalingFactory;
  /** Joins `roomId` and resolves with the channel and the room:joined payload. */
  join(
    sessionId: string,
    displayName: string,
    roomId?: string,
  ): Promise<{ channel: SignalingChannel; joined: RoomJoinedPayload }>;
  stop(): Promise<void>;
}

/**
 * Runs the signaling server on an ephemeral port and hands out real client
 * channels, so server behaviour is asserted through the transport the app uses
 * rather than through a stand-in.
 */
export async function startRoomServer(execution?: ExecutionService): Promise<RoomServer> {
  const httpServer = createServer();
  const io: CollabServer = new Server(httpServer);
  registerSignalingHandlers(io, execution);
  httpServer.listen(0);
  await once(httpServer, 'listening');
  const url = `http://localhost:${(httpServer.address() as AddressInfo).port}`;
  const connect = createSocketSignaling(url);
  const channels: SignalingChannel[] = [];

  return {
    url,
    io,
    connect,
    async join(sessionId, displayName, roomId = 'room') {
      const channel = connect({ sessionId, roomId, displayName, state: INITIAL_PEER_STATE });
      channels.push(channel);
      const joined = new Promise<RoomJoinedPayload>((resolve) =>
        channel.on('room:joined', resolve),
      );
      await channel.connect();
      return { channel, joined: await joined };
    },
    async stop() {
      for (const channel of channels.splice(0)) {
        channel.disconnect();
      }
      await io.close();
    },
  };
}

/** Lets queued socket traffic reach every participant before asserting. */
export const settle = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 60);
  });
