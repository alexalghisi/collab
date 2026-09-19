import * as Y from 'yjs';
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from 'y-protocols/awareness';
import type { SignalingChannel } from '../signaling/SignalingChannel';
import { decodeUpdate, encodeUpdate } from './updates';
import { DEFAULT_CODE_LANGUAGE, isCodeLanguage, type CodeLanguage } from './languages';

export interface CodeIdentity {
  readonly peerId: string;
  readonly displayName: string;
}

/** Offsets into the shared text, so a selection survives being reindexed. */
export interface CodeSelection {
  readonly start: number;
  readonly end: number;
}

/** A remote participant's cursor, as published through Yjs awareness. */
export interface CodePresence {
  readonly clientId: number;
  readonly peerId: string;
  readonly displayName: string;
  readonly color: string;
  readonly selection: CodeSelection | null;
}

interface AwarenessUser {
  readonly peerId: string;
  readonly name: string;
  readonly color: string;
}

/** Distinguishable at a glance on the dark editor background. */
const COLORS = [
  '#f87171',
  '#fbbf24',
  '#34d399',
  '#60a5fa',
  '#a78bfa',
  '#f472b6',
  '#22d3ee',
  '#a3e635',
] as const;

const REMOTE = 'remote';

export function colorFor(peerId: string): string {
  let hash = 0;
  for (let index = 0; index < peerId.length; index += 1) {
    hash = (hash * 31 + peerId.charCodeAt(index)) % 0xffffffff;
  }
  return COLORS[hash % COLORS.length];
}

/**
 * The shared editor document: a Yjs text plus cursor awareness, both carried by
 * the room's signaling channel instead of a dedicated y-websocket server.
 *
 * Updates are exchanged as base64 blobs. Anything arriving from the channel is
 * applied with the `remote` origin so it is not sent straight back out, which is
 * what keeps two peers from bouncing the same update forever.
 */
export class SharedCodeDocument {
  readonly doc = new Y.Doc();
  readonly text = this.doc.getText('code');
  readonly awareness = new Awareness(this.doc);
  readonly color: string;

  private readonly meta = this.doc.getMap<string>('meta');
  private readonly listeners = new Set<() => void>();
  private live = true;

  constructor(
    private readonly channel: SignalingChannel,
    identity: CodeIdentity,
  ) {
    this.color = colorFor(identity.peerId);
    this.awareness.setLocalStateField('user', {
      peerId: identity.peerId,
      name: identity.displayName,
      color: this.color,
    } satisfies AwarenessUser);

    this.doc.on('update', this.onDocUpdate);
    this.awareness.on('update', this.onAwarenessUpdate);
    channel.on('code:update', this.receiveUpdate);
    channel.on('code:awareness', this.receiveAwareness);
    channel.on('room:joined', this.onRoomJoined);
    channel.on('peer:joined', this.onPeerJoined);
    // The panel may open long after the room was joined, in which case neither
    // of those fires again.
    this.announce();
  }

  get language(): CodeLanguage {
    const stored = this.meta.get('language');
    return isCodeLanguage(stored) ? stored : DEFAULT_CODE_LANGUAGE;
  }

  setLanguage(language: CodeLanguage): void {
    this.meta.set('language', language);
  }

  /** Fires after any change, local or remote, to the text or the language. */
  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  presence(): CodePresence[] {
    const entries: CodePresence[] = [];
    for (const [clientId, state] of this.awareness.getStates()) {
      const user = (state as { user?: AwarenessUser }).user;
      if (clientId === this.doc.clientID || !user) {
        continue;
      }
      entries.push({
        clientId,
        peerId: user.peerId,
        displayName: user.name,
        color: user.color,
        selection: (state as { selection?: CodeSelection }).selection ?? null,
      });
    }
    return entries;
  }

  setSelection(selection: CodeSelection): void {
    this.awareness.setLocalStateField('selection', selection);
  }

  /** Fires when a remote cursor moves, joins or goes away. */
  onPresence(listener: () => void): () => void {
    this.awareness.on('change', listener);
    return () => this.awareness.off('change', listener);
  }

  encodeState(): string {
    return encodeUpdate(Y.encodeStateAsUpdate(this.doc));
  }

  applyState(state: string): void {
    Y.applyUpdate(this.doc, decodeUpdate(state), REMOTE);
  }

  /** Sends the whole document, so a peer that missed updates catches up. */
  publishState(): void {
    if (this.live) {
      this.channel.emit('code:update', this.encodeState());
    }
  }

  /** Re-publishes our cursor, which a peer that joined later has never seen. */
  announce(): void {
    if (this.live) {
      this.channel.emit(
        'code:awareness',
        encodeUpdate(encodeAwarenessUpdate(this.awareness, [this.doc.clientID])),
      );
    }
  }

  destroy(): void {
    if (!this.live) {
      return;
    }
    removeAwarenessStates(this.awareness, [this.doc.clientID], 'local');
    this.live = false;
    this.doc.off('update', this.onDocUpdate);
    this.awareness.off('update', this.onAwarenessUpdate);
    this.listeners.clear();
    this.awareness.destroy();
  }

  private readonly onDocUpdate = (update: Uint8Array, origin: unknown): void => {
    if (origin !== REMOTE) {
      this.channel.emit('code:update', encodeUpdate(update));
    }
    for (const listener of this.listeners) {
      listener();
    }
  };

  private readonly onAwarenessUpdate = (
    changes: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ): void => {
    if (origin === REMOTE) {
      return;
    }
    const clients = [...changes.added, ...changes.updated, ...changes.removed];
    this.channel.emit(
      'code:awareness',
      encodeUpdate(encodeAwarenessUpdate(this.awareness, clients)),
    );
  };

  private readonly receiveUpdate = (update: string): void => {
    Y.applyUpdate(this.doc, decodeUpdate(update), REMOTE);
  };

  private readonly receiveAwareness = (update: string): void => {
    applyAwarenessUpdate(this.awareness, decodeUpdate(update), REMOTE);
  };

  private readonly onRoomJoined = (room: { readonly code: string | null }): void => {
    if (room.code) {
      this.applyState(room.code);
    }
    if (room.code || this.text.length > 0) {
      this.publishState();
    }
    this.announce();
  };

  private readonly onPeerJoined = (): void => {
    this.publishState();
    this.announce();
  };
}
