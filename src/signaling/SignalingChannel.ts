import type { ClientToServerEvents, PeerState, ServerToClientEvents } from './events';

/** Events a client may send once it is inside a room. */
export type OutgoingEvent = Exclude<keyof ClientToServerEvents, 'room:join'>;
export type OutgoingPayload<E extends OutgoingEvent> = Parameters<ClientToServerEvents[E]>[0];

/**
 * Transport-agnostic signaling contract. Handlers are registered before
 * `connect()`, which joins the room and resolves once the peer list arrived.
 */
export interface SignalingChannel {
  on<E extends keyof ServerToClientEvents>(event: E, handler: ServerToClientEvents[E]): void;
  emit<E extends OutgoingEvent>(event: E, payload: OutgoingPayload<E>): void;
  connect(): Promise<void>;
  disconnect(): void;
}

export interface SignalingOptions {
  /** Identifies this participant across room changes (see JoinRoomPayload). */
  readonly sessionId: string;
  readonly roomId: string;
  readonly displayName: string;
  readonly state: PeerState;
  /** Main room id when joining one of its breakout rooms. */
  readonly breakoutOf?: string;
}

/** `connect()` rejects with this when the host turns us away at the waiting room. */
export class AdmissionDeniedError extends Error {
  constructor() {
    super('The host did not admit you to the meeting.');
    this.name = 'AdmissionDeniedError';
  }
}

/** `connect()` rejects with this when the transport itself is unreachable. */
export class SignalingUnavailableError extends Error {
  constructor(readonly url: string) {
    super(`Unable to reach the signaling service at ${url}.`);
    this.name = 'SignalingUnavailableError';
  }
}

export type SignalingFactory = (options: SignalingOptions) => SignalingChannel;

type Listener = (...args: unknown[]) => void;

/** Minimal typed event dispatcher shared by transports that fan out locally. */
export class SignalingEmitter {
  private readonly listeners = new Map<keyof ServerToClientEvents, Listener[]>();

  on<E extends keyof ServerToClientEvents>(event: E, handler: ServerToClientEvents[E]): void {
    const list = this.listeners.get(event) ?? [];
    list.push(handler as Listener);
    this.listeners.set(event, list);
  }

  dispatch<E extends keyof ServerToClientEvents>(
    event: E,
    ...args: Parameters<ServerToClientEvents[E]>
  ): void {
    for (const listener of this.listeners.get(event) ?? []) {
      (listener as (...params: Parameters<ServerToClientEvents[E]>) => void)(...args);
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}
