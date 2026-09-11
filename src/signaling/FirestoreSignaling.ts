import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  type CollectionReference,
  type DocumentReference,
  type Firestore,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import type { PeerInfo } from './events';
import { SignalingEmitter, type SignalingChannel, type SignalingFactory } from './SignalingChannel';

interface ParticipantDoc {
  readonly displayName: string;
  readonly joinedAt: number;
  readonly lastSeen: number;
}

interface RoomDoc {
  readonly hostPeerId: string;
}

type SignalType = 'offer' | 'answer' | 'ice';

interface SignalDoc {
  readonly from: string;
  readonly type: SignalType;
  readonly payload: RTCSessionDescriptionInit | RTCIceCandidateInit;
  readonly createdAt: number;
}

const HEARTBEAT_MS = 20_000;
const STALE_AFTER_MS = 60_000;

/** Firestore rejects `undefined` fields; WebRTC dictionaries may contain them. */
function toPlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function toPeerInfo(snapshot: QueryDocumentSnapshot): PeerInfo {
  const data = snapshot.data() as ParticipantDoc;
  return { peerId: snapshot.id, displayName: data.displayName, joinedAt: data.joinedAt };
}

class FirestoreChannel implements SignalingChannel {
  private readonly peerId = crypto.randomUUID();
  private readonly emitter = new SignalingEmitter();
  private readonly room: DocumentReference;
  private readonly participants: CollectionReference;
  private readonly unsubscribers: Unsubscribe[] = [];
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private joinedAt = 0;
  private readonly pageHide = {
    handler: () => this.disconnect(),
    attach: () => window.addEventListener('pagehide', this.pageHide.handler),
    detach: () => window.removeEventListener('pagehide', this.pageHide.handler),
  };

  constructor(
    db: Firestore,
    roomId: string,
    private readonly displayName: string,
  ) {
    this.room = doc(db, 'rooms', roomId);
    this.participants = collection(this.room, 'participants');
  }

  on: SignalingChannel['on'] = (event, handler) => {
    this.emitter.on(event, handler);
  };

  emit: SignalingChannel['emit'] = (event, payload) => {
    const type: SignalType =
      event === 'signal:offer' ? 'offer' : event === 'signal:answer' ? 'answer' : 'ice';
    const body = 'description' in payload ? payload.description : payload.candidate;
    const signal: SignalDoc = {
      from: this.peerId,
      type,
      payload: toPlain(body),
      createdAt: Date.now(),
    };
    void addDoc(this.inboxOf(payload.targetPeerId), signal);
  };

  async connect(): Promise<void> {
    this.joinedAt = Date.now();
    const self: ParticipantDoc = {
      displayName: this.displayName,
      joinedAt: this.joinedAt,
      lastSeen: this.joinedAt,
    };
    await setDoc(this.selfRef(), self);
    const hostPeerId = await this.claimHostIfVacant();

    this.heartbeat = setInterval(() => {
      void updateDoc(this.selfRef(), { lastSeen: Date.now() });
    }, HEARTBEAT_MS);
    this.subscribeInbox();
    this.subscribeHost();
    this.pageHide.attach();

    await this.subscribeParticipants(hostPeerId);
  }

  disconnect(): void {
    this.pageHide.detach();
    if (this.heartbeat) {
      clearInterval(this.heartbeat);
      this.heartbeat = null;
    }
    for (const unsubscribe of this.unsubscribers) {
      unsubscribe();
    }
    this.unsubscribers.length = 0;
    this.emitter.clear();
    void deleteDoc(this.selfRef());
  }

  private selfRef(): DocumentReference {
    return doc(this.participants, this.peerId);
  }

  private inboxOf(peerId: string): CollectionReference {
    return collection(this.participants, peerId, 'inbox');
  }

  private async claimHostIfVacant(): Promise<string> {
    return runTransaction(this.room.firestore, async (transaction) => {
      const room = await transaction.get(this.room);
      const currentHost = (room.data() as RoomDoc | undefined)?.hostPeerId;
      if (currentHost) {
        const hostDoc = await transaction.get(doc(this.participants, currentHost));
        if (hostDoc.exists()) {
          return currentHost;
        }
      }
      transaction.set(this.room, { hostPeerId: this.peerId } satisfies RoomDoc, { merge: true });
      return this.peerId;
    });
  }

  private subscribeParticipants(hostPeerId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      let initial = true;
      const unsubscribe = onSnapshot(
        this.participants,
        (snapshot) => {
          if (initial) {
            initial = false;
            const now = Date.now();
            const peers: PeerInfo[] = [];
            for (const participant of snapshot.docs) {
              if (participant.id === this.peerId) {
                continue;
              }
              const data = participant.data() as ParticipantDoc;
              if (now - data.lastSeen > STALE_AFTER_MS) {
                void deleteDoc(participant.ref);
                continue;
              }
              peers.push(toPeerInfo(participant));
            }
            this.emitter.dispatch('room:joined', {
              selfPeerId: this.peerId,
              selfJoinedAt: this.joinedAt,
              hostPeerId,
              peers,
            });
            resolve();
            return;
          }
          for (const change of snapshot.docChanges()) {
            if (change.doc.id === this.peerId) {
              continue;
            }
            if (change.type === 'added') {
              this.emitter.dispatch('peer:joined', toPeerInfo(change.doc));
            } else if (change.type === 'removed') {
              this.emitter.dispatch('peer:left', change.doc.id);
            }
          }
        },
        reject,
      );
      this.unsubscribers.push(unsubscribe);
    });
  }

  private subscribeHost(): void {
    const unsubscribe = onSnapshot(this.room, (snapshot) => {
      const host = (snapshot.data() as RoomDoc | undefined)?.hostPeerId;
      if (host) {
        this.emitter.dispatch('room:host', host);
      }
    });
    this.unsubscribers.push(unsubscribe);
  }

  private subscribeInbox(): void {
    const inbox = query(this.inboxOf(this.peerId), orderBy('createdAt'));
    const unsubscribe = onSnapshot(inbox, (snapshot) => {
      for (const change of snapshot.docChanges()) {
        if (change.type !== 'added') {
          continue;
        }
        const signal = change.doc.data() as SignalDoc;
        this.deliver(signal);
        void deleteDoc(change.doc.ref);
      }
    });
    this.unsubscribers.push(unsubscribe);
  }

  private deliver({ from, type, payload }: SignalDoc): void {
    if (type === 'ice') {
      this.emitter.dispatch('signal:ice', {
        fromPeerId: from,
        candidate: payload as RTCIceCandidateInit,
      });
      return;
    }
    const description = payload as RTCSessionDescriptionInit;
    this.emitter.dispatch(type === 'offer' ? 'signal:offer' : 'signal:answer', {
      fromPeerId: from,
      description,
    });
  }
}

export function createFirestoreSignaling(db: Firestore): SignalingFactory {
  return ({ roomId, displayName }) => new FirestoreChannel(db, roomId, displayName);
}
