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
import type { ChatMessage, PeerInfo, PeerState } from './events';
import {
  SignalingEmitter,
  type OutgoingEvent,
  type OutgoingPayload,
  type SignalingChannel,
  type SignalingFactory,
} from './SignalingChannel';

interface ParticipantDoc {
  readonly displayName: string;
  readonly joinedAt: number;
  readonly lastSeen: number;
  readonly state: PeerState;
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

type MessageDoc = Omit<ChatMessage, 'id'>;

type Senders = { [E in OutgoingEvent]: (payload: OutgoingPayload<E>) => void };

const HEARTBEAT_MS = 20_000;
const STALE_AFTER_MS = 60_000;

/** Firestore rejects `undefined` fields; WebRTC dictionaries may contain them. */
function toPlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function toPeerInfo(snapshot: QueryDocumentSnapshot): PeerInfo {
  const data = snapshot.data() as ParticipantDoc;
  return {
    peerId: snapshot.id,
    displayName: data.displayName,
    joinedAt: data.joinedAt,
    state: data.state,
  };
}

class FirestoreChannel implements SignalingChannel {
  private readonly peerId = crypto.randomUUID();
  private readonly emitter = new SignalingEmitter();
  private readonly room: DocumentReference;
  private readonly participants: CollectionReference;
  private readonly messages: CollectionReference;
  private readonly unsubscribers: Unsubscribe[] = [];
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private joinedAt = 0;
  private readonly pageHide = {
    handler: () => this.disconnect(),
    attach: () => window.addEventListener('pagehide', this.pageHide.handler),
    detach: () => window.removeEventListener('pagehide', this.pageHide.handler),
  };

  private readonly senders: Senders = {
    'signal:offer': ({ targetPeerId, description }) =>
      this.sendSignal(targetPeerId, 'offer', description),
    'signal:answer': ({ targetPeerId, description }) =>
      this.sendSignal(targetPeerId, 'answer', description),
    'signal:ice': ({ targetPeerId, candidate }) => this.sendSignal(targetPeerId, 'ice', candidate),
    'peer:state': (state) => {
      void updateDoc(this.selfRef(), { state });
    },
    'chat:message': (text) => {
      const message: MessageDoc = {
        peerId: this.peerId,
        displayName: this.displayName,
        text,
        sentAt: Date.now(),
      };
      void addDoc(this.messages, message);
    },
  };

  constructor(
    db: Firestore,
    roomId: string,
    private readonly displayName: string,
    private readonly initialState: PeerState,
  ) {
    this.room = doc(db, 'rooms', roomId);
    this.participants = collection(this.room, 'participants');
    this.messages = collection(this.room, 'messages');
  }

  on: SignalingChannel['on'] = (event, handler) => {
    this.emitter.on(event, handler);
  };

  emit: SignalingChannel['emit'] = (event, payload) => {
    this.senders[event](payload);
  };

  async connect(): Promise<void> {
    this.joinedAt = Date.now();
    const self: ParticipantDoc = {
      displayName: this.displayName,
      joinedAt: this.joinedAt,
      lastSeen: this.joinedAt,
      state: this.initialState,
    };
    await setDoc(this.selfRef(), self);
    const hostPeerId = await this.claimHostIfVacant();

    this.heartbeat = setInterval(() => {
      void updateDoc(this.selfRef(), { lastSeen: Date.now() });
    }, HEARTBEAT_MS);
    this.subscribeInbox();
    this.subscribeHost();
    this.subscribeMessages();
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

  private sendSignal(
    targetPeerId: string,
    type: SignalType,
    payload: RTCSessionDescriptionInit | RTCIceCandidateInit,
  ): void {
    const signal: SignalDoc = {
      from: this.peerId,
      type,
      payload: toPlain(payload),
      createdAt: Date.now(),
    };
    void addDoc(this.inboxOf(targetPeerId), signal);
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
            } else {
              const { state } = change.doc.data() as ParticipantDoc;
              this.emitter.dispatch('peer:state', { peerId: change.doc.id, state });
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

  private subscribeMessages(): void {
    const ordered = query(this.messages, orderBy('sentAt'));
    const unsubscribe = onSnapshot(ordered, (snapshot) => {
      for (const change of snapshot.docChanges()) {
        if (change.type === 'added') {
          const data = change.doc.data() as MessageDoc;
          this.emitter.dispatch('chat:message', { id: change.doc.id, ...data });
        }
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
  return ({ roomId, displayName, state }) => new FirestoreChannel(db, roomId, displayName, state);
}
