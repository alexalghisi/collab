import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  writeBatch,
  type CollectionReference,
  type DocumentReference,
  type Firestore,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { getDownloadURL, ref as storageRef, uploadBytesResumable } from 'firebase/storage';
import { randomUUID } from 'expo-crypto';
import type { StructuredAction } from '../assistant/types';
import { EXECUTION_URL } from '../code/config';
import type { ChatDraft } from '../chat/messages';
import type { ExecutionRequest, ExecutionResult } from '../code/execution';
import type { CodeLanguage } from '../code/languages';
import { mergeEncodedUpdates } from '../code/updates';
import {
  ATTACHMENT_REJECTION_MESSAGES,
  safeFileName,
  type FileAttachment,
} from '../files/attachments';
import {
  AttachmentError,
  assertUploadable,
  readBlob,
  type UploadableFile,
  type UploadProgress,
} from '../files/upload';
import { firebaseStorage } from '../firebase/app';
import { normalizeTranscriptSegment } from '../transcript/segments';
import {
  DEFAULT_ROOM_SETTINGS,
  type ChatMessage,
  type HostCommand,
  type PeerInfo,
  type PeerState,
  type RoomSettings,
  type Stroke,
  type WaitingPeer,
} from './events';
import {
  AdmissionDeniedError,
  SignalingEmitter,
  type OutgoingEvent,
  type OutgoingPayload,
  type SignalingChannel,
  type SignalingFactory,
  type SignalingOptions,
} from './SignalingChannel';

interface ParticipantDoc {
  readonly displayName: string;
  readonly joinedAt: number;
  readonly lastSeen: number;
  readonly state: PeerState;
  /** Latest editor awareness of this participant; presence, so it is not kept. */
  readonly codeAwareness?: string;
}

interface CodeUpdateDoc {
  readonly update: string;
  readonly createdAt: number;
}

/** One execution, from the click on Run to the sandbox's verdict. */
interface CodeRunDoc {
  readonly byPeerId: string;
  readonly byDisplayName: string;
  readonly language: CodeLanguage;
  readonly startedAt: number;
  readonly stdout?: string;
  readonly stderr?: string;
  readonly exitCode?: number | null;
  readonly timedOut?: boolean;
  readonly error?: string | null;
  readonly finished?: boolean;
}

interface RoomDoc {
  readonly hostPeerId: string;
  readonly notes?: string;
  readonly settings?: RoomSettings;
}

/** Room state as seen by a joiner, with defaults filled in. */
interface RoomSnapshot {
  readonly hostPeerId: string;
  readonly notes: string;
  readonly settings: RoomSettings;
}

interface WaitingDoc {
  readonly displayName: string;
  readonly decision?: 'admitted' | 'denied';
}

type SignalType = 'offer' | 'answer' | 'ice' | 'command';

interface SignalDoc {
  readonly from: string;
  readonly type: SignalType;
  readonly payload: RTCSessionDescriptionInit | RTCIceCandidateInit | HostCommand;
  readonly createdAt: number;
}

type MessageDoc = Omit<ChatMessage, 'id'>;

type Senders = { [E in OutgoingEvent]: (payload: OutgoingPayload<E>) => void };

const HEARTBEAT_MS = 20_000;
const STALE_AFTER_MS = 60_000;
/** Cursor moves are continuous; participant documents are not free to write. */
const AWARENESS_THROTTLE_MS = 200;
/** Above this, the host squashes the update log so late joiners replay less. */
const COMPACT_UPDATES_AT = 120;

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

function sameSettings(a: RoomSettings, b: RoomSettings): boolean {
  return a.waitingRoom === b.waitingRoom && a.breakoutOpen === b.breakoutOpen;
}

class FirestoreChannel implements SignalingChannel {
  private readonly peerId: string;
  private readonly emitter = new SignalingEmitter();
  private readonly room: DocumentReference;
  private readonly participants: CollectionReference;
  private readonly messages: CollectionReference;
  private readonly strokes: CollectionReference;
  private readonly codeUpdates: CollectionReference;
  private readonly codeRuns: CollectionReference;
  private readonly transcript: CollectionReference;
  private readonly assistantTurns: CollectionReference;
  private readonly waiting: CollectionReference;
  private readonly unsubscribers: Unsubscribe[] = [];
  private unsubscribeWaiting: Unsubscribe | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private awarenessTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingAwareness: string | null = null;
  private isHost = false;
  /** Output already dispatched per run, so a growing document yields deltas. */
  private readonly runOutput = new Map<string, { stdout: number; stderr: number }>();
  private compacting = false;
  private joinedAt = 0;
  private lastSettings = DEFAULT_ROOM_SETTINGS;
  /** Our own notes writes echo back through the room snapshot; they must not overwrite newer typing. */
  private lastSentNotes: string | null = null;
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
    'chat:message': ({ text, file }: ChatDraft) => {
      const message: MessageDoc = {
        peerId: this.peerId,
        displayName: this.options.displayName,
        text,
        file,
        sentAt: Date.now(),
      };
      void addDoc(this.messages, message);
    },
    'board:stroke': (stroke) => {
      void setDoc(doc(this.strokes, stroke.id), stroke);
    },
    'board:remove': (strokeIds) => {
      const batch = writeBatch(this.room.firestore);
      for (const id of strokeIds) {
        batch.delete(doc(this.strokes, id));
      }
      void batch.commit();
    },
    'notes:update': (notes) => {
      this.lastSentNotes = notes;
      void setDoc(this.room, { notes }, { merge: true });
    },
    'code:update': (update) => {
      const entry: CodeUpdateDoc = { update, createdAt: Date.now() };
      void addDoc(this.codeUpdates, entry);
    },
    'code:awareness': (update) => this.sendAwareness(update),
    'code:run': (request) => {
      void this.runCode(request);
    },
    'assistant:ask': (ask) => {
      void this.askAssistant(ask);
    },
    'transcript:segment': (segment) => {
      const entry = normalizeTranscriptSegment({
        ...segment,
        peerId: this.peerId,
        displayName: this.options.displayName,
      });
      if (entry) {
        void setDoc(doc(this.transcript, entry.id), entry);
      }
    },
    'room:settings': (settings) => {
      this.lastSettings = settings;
      void setDoc(this.room, { settings }, { merge: true });
    },
    'host:command': ({ targetPeerId, command }) => {
      if (targetPeerId !== null) {
        this.sendSignal(targetPeerId, 'command', command);
        return;
      }
      void getDocs(this.participants).then((snapshot) => {
        for (const participant of snapshot.docs) {
          if (participant.id !== this.peerId) {
            this.sendSignal(participant.id, 'command', command);
          }
        }
      });
    },
    'waiting:decide': ({ peerId, admit }) => {
      void updateDoc(doc(this.waiting, peerId), { decision: admit ? 'admitted' : 'denied' });
    },
  };

  constructor(
    db: Firestore,
    private readonly options: SignalingOptions,
  ) {
    this.peerId = options.sessionId;
    this.room = doc(db, 'rooms', options.roomId);
    this.participants = collection(this.room, 'participants');
    this.messages = collection(this.room, 'messages');
    this.strokes = collection(this.room, 'strokes');
    this.codeUpdates = collection(this.room, 'codeUpdates');
    this.codeRuns = collection(this.room, 'runs');
    this.transcript = collection(this.room, 'transcript');
    this.assistantTurns = collection(this.room, 'assistant');
    this.waiting = collection(this.room, 'waiting');
  }

  on: SignalingChannel['on'] = (event, handler) => {
    this.emitter.on(event, handler);
  };

  emit: SignalingChannel['emit'] = (event, payload) => {
    this.senders[event](payload);
  };

  async connect(): Promise<void> {
    const current = await this.syncRoom(false);
    // Without a live host nobody could admit us, so the waiting room only applies when one exists.
    if (current.settings.waitingRoom && current.hostPeerId) {
      await this.waitForAdmission();
    }

    this.joinedAt = Date.now();
    const self: ParticipantDoc = {
      displayName: this.options.displayName,
      joinedAt: this.joinedAt,
      lastSeen: this.joinedAt,
      state: this.options.state,
    };
    await setDoc(this.selfRef(), self);
    const room = await this.syncRoom(true);
    this.lastSettings = room.settings;

    this.heartbeat = setInterval(() => {
      void updateDoc(this.selfRef(), { lastSeen: Date.now() });
    }, HEARTBEAT_MS);
    this.subscribeInbox();
    this.subscribeRoom();
    this.subscribeMessages();
    if (this.options.breakoutOf) {
      this.subscribeMainRoom(this.options.breakoutOf);
    }
    this.pageHide.attach();

    await this.subscribeParticipants(room);
    // After room:joined, so the existing drawing streams in as board:stroke events.
    this.subscribeStrokes();
    this.subscribeCodeUpdates();
    this.subscribeCodeRuns();
    this.subscribeTranscript();
    this.subscribeAssistant();
  }

  /**
   * There is no server on this route, so the file goes to Storage and the rules
   * are what enforce the size and the type. The bucket path carries the room, so
   * a rule can say who may write where.
   */
  async upload(file: UploadableFile, onProgress: UploadProgress): Promise<FileAttachment> {
    assertUploadable(file);
    if (!firebaseStorage) {
      throw new AttachmentError('File sharing is not enabled on this deployment.');
    }
    const id = randomUUID();
    const name = safeFileName(file.name);
    const target = storageRef(firebaseStorage, `rooms/${this.options.roomId}/${id}/${name}`);
    const task = uploadBytesResumable(target, await readBlob(file), { contentType: file.mimeType });
    task.on('state_changed', (snapshot) => {
      onProgress(snapshot.totalBytes === 0 ? 0 : snapshot.bytesTransferred / snapshot.totalBytes);
    });
    try {
      await task;
    } catch (cause) {
      // Storage refuses an oversized or disallowed file through its rules, which
      // arrives here as an unauthorized error rather than a description.
      throw new AttachmentError(
        (cause as { code?: string }).code === 'storage/unauthorized'
          ? ATTACHMENT_REJECTION_MESSAGES['unsupported-type']
          : 'The file could not be shared.',
      );
    }
    return {
      id,
      name,
      mimeType: file.mimeType,
      size: file.size,
      url: await getDownloadURL(target),
    };
  }

  disconnect(): void {
    this.pageHide.detach();
    if (this.heartbeat) {
      clearInterval(this.heartbeat);
      this.heartbeat = null;
    }
    if (this.awarenessTimer) {
      clearTimeout(this.awarenessTimer);
      this.awarenessTimer = null;
    }
    this.pendingAwareness = null;
    for (const unsubscribe of this.unsubscribers) {
      unsubscribe();
    }
    this.unsubscribers.length = 0;
    this.unsubscribeWaiting?.();
    this.unsubscribeWaiting = null;
    this.emitter.clear();
    void deleteDoc(this.selfRef());
    if (this.joinedAt === 0) {
      // Left while still waiting: take the ticket out of the host's list.
      void deleteDoc(doc(this.waiting, this.peerId));
    }
  }

  private selfRef(): DocumentReference {
    return doc(this.participants, this.peerId);
  }

  private inboxOf(peerId: string): CollectionReference {
    return collection(this.participants, peerId, 'inbox');
  }

  private sendSignal(targetPeerId: string, type: SignalType, payload: SignalDoc['payload']): void {
    const signal: SignalDoc = {
      from: this.peerId,
      type,
      payload: toPlain(payload),
      createdAt: Date.now(),
    };
    void addDoc(this.inboxOf(targetPeerId), signal);
  }

  /**
   * Reads the room inside a transaction. With `claim`, takes the host seat atomically
   * when the recorded host has left, so two simultaneous joiners cannot both become host.
   */
  private syncRoom(claim: boolean): Promise<RoomSnapshot> {
    return runTransaction(this.room.firestore, async (transaction) => {
      const data = (await transaction.get(this.room)).data() as RoomDoc | undefined;
      const notes = data?.notes ?? '';
      const settings = data?.settings ?? DEFAULT_ROOM_SETTINGS;
      if (data?.hostPeerId) {
        const hostDoc = await transaction.get(doc(this.participants, data.hostPeerId));
        if (hostDoc.exists()) {
          return { hostPeerId: data.hostPeerId, notes, settings };
        }
      }
      if (!claim) {
        return { hostPeerId: '', notes, settings };
      }
      transaction.set(this.room, { hostPeerId: this.peerId }, { merge: true });
      return { hostPeerId: this.peerId, notes, settings };
    });
  }

  /**
   * Parks us in rooms/{id}/waiting until the host admits (resolves) or denies (rejects).
   * An admitted ticket is kept, so coming back from a breakout room skips the queue.
   */
  private async waitForAdmission(): Promise<void> {
    const ticket = doc(this.waiting, this.peerId);
    const existing = (await getDoc(ticket)).data() as WaitingDoc | undefined;
    if (existing?.decision === 'admitted') {
      return;
    }
    const entry: WaitingDoc = { displayName: this.options.displayName };
    await setDoc(ticket, entry);
    this.pageHide.attach();
    this.emitter.dispatch('room:waiting');
    let admitted = false;
    try {
      await new Promise<void>((resolve, reject) => {
        const unsubscribe = onSnapshot(
          ticket,
          (snapshot) => {
            const decision = (snapshot.data() as WaitingDoc | undefined)?.decision;
            if (!decision) {
              return;
            }
            unsubscribe();
            if (decision === 'admitted') {
              admitted = true;
              resolve();
            } else {
              reject(new AdmissionDeniedError());
            }
          },
          reject,
        );
        // Leaving while still waiting must also stop listening.
        this.unsubscribers.push(unsubscribe);
      });
    } finally {
      this.pageHide.detach();
      if (!admitted) {
        void deleteDoc(ticket);
      }
    }
  }

  private subscribeParticipants({ hostPeerId, notes, settings }: RoomSnapshot): Promise<void> {
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
              strokes: [],
              notes,
              settings,
              code: null,
              transcript: [],
            });
            resolve();
            return;
          }
          for (const change of snapshot.docChanges()) {
            if (change.doc.id === this.peerId) {
              continue;
            }
            const data = change.doc.data() as ParticipantDoc;
            if (change.type === 'added') {
              this.emitter.dispatch('peer:joined', toPeerInfo(change.doc));
            } else if (change.type === 'removed') {
              this.emitter.dispatch('peer:left', change.doc.id);
            } else {
              this.emitter.dispatch('peer:state', { peerId: change.doc.id, state: data.state });
            }
            if (change.type !== 'removed' && data.codeAwareness) {
              this.emitter.dispatch('code:awareness', data.codeAwareness);
            }
          }
        },
        reject,
      );
      this.unsubscribers.push(unsubscribe);
    });
  }

  private subscribeRoom(): void {
    const unsubscribe = onSnapshot(this.room, (snapshot) => {
      const data = snapshot.data() as RoomDoc | undefined;
      if (data?.hostPeerId) {
        this.isHost = data.hostPeerId === this.peerId;
        this.emitter.dispatch('room:host', data.hostPeerId);
        this.syncWaitingSubscription(this.isHost);
      }
      const notes = data?.notes ?? '';
      if (notes !== this.lastSentNotes) {
        this.emitter.dispatch('notes:update', notes);
      }
      const settings = data?.settings ?? DEFAULT_ROOM_SETTINGS;
      if (!sameSettings(settings, this.lastSettings)) {
        this.lastSettings = settings;
        this.emitter.dispatch('room:settings', settings);
      }
    });
    this.unsubscribers.push(unsubscribe);
  }

  /** Only the host watches the waiting list; hand-over starts or stops the subscription. */
  private syncWaitingSubscription(isHost: boolean): void {
    if (isHost === (this.unsubscribeWaiting !== null)) {
      return;
    }
    if (!isHost) {
      this.unsubscribeWaiting?.();
      this.unsubscribeWaiting = null;
      return;
    }
    this.unsubscribeWaiting = onSnapshot(this.waiting, (snapshot) => {
      const peers: WaitingPeer[] = snapshot.docs
        .filter((entry) => !(entry.data() as WaitingDoc).decision)
        .map((entry) => ({
          peerId: entry.id,
          displayName: (entry.data() as WaitingDoc).displayName,
        }));
      this.emitter.dispatch('waiting:update', peers);
    });
  }

  /** In a breakout room: the host closing the rooms on the main room sends everyone back. */
  private subscribeMainRoom(mainRoomId: string): void {
    const mainRoom = doc(this.room.firestore, 'rooms', mainRoomId);
    let seenOpen = false;
    const unsubscribe = onSnapshot(mainRoom, (snapshot) => {
      const open = (snapshot.data() as RoomDoc | undefined)?.settings?.breakoutOpen ?? false;
      if (open) {
        seenOpen = true;
      } else if (seenOpen) {
        this.emitter.dispatch('host:command', { action: 'move', roomId: mainRoomId });
      }
    });
    this.unsubscribers.push(unsubscribe);
  }

  private subscribeStrokes(): void {
    const unsubscribe = onSnapshot(this.strokes, (snapshot) => {
      const removed: string[] = [];
      for (const change of snapshot.docChanges()) {
        if (change.type === 'added') {
          this.emitter.dispatch('board:stroke', change.doc.data() as Stroke);
        } else if (change.type === 'removed') {
          removed.push(change.doc.id);
        }
      }
      if (removed.length > 0) {
        this.emitter.dispatch('board:remove', removed);
      }
    });
    this.unsubscribers.push(unsubscribe);
  }

  /**
   * Editor updates are stored one document at a time, the way strokes are, so a
   * late joiner replays them and converges. The host squashes the log once it
   * grows past `COMPACT_UPDATES_AT`, which bounds both storage and replay cost.
   */
  private subscribeCodeUpdates(): void {
    const ordered = query(this.codeUpdates, orderBy('createdAt'));
    const unsubscribe = onSnapshot(ordered, (snapshot) => {
      for (const change of snapshot.docChanges()) {
        if (change.type === 'added') {
          this.emitter.dispatch('code:update', (change.doc.data() as CodeUpdateDoc).update);
        }
      }
      if (this.isHost && !this.compacting && snapshot.size > COMPACT_UPDATES_AT) {
        void this.compactCodeUpdates(snapshot.docs);
      }
    });
    this.unsubscribers.push(unsubscribe);
  }

  private async compactCodeUpdates(entries: QueryDocumentSnapshot[]): Promise<void> {
    this.compacting = true;
    try {
      const merged = mergeEncodedUpdates(
        entries.map((entry) => (entry.data() as CodeUpdateDoc).update),
      );
      const batch = writeBatch(this.room.firestore);
      for (const entry of entries) {
        batch.delete(entry.ref);
      }
      const squashed: CodeUpdateDoc = { update: merged, createdAt: Date.now() };
      batch.set(doc(this.codeUpdates), squashed);
      await batch.commit();
    } finally {
      this.compacting = false;
    }
  }

  /**
   * Firestore has no server to run anything, so the sandbox is called over HTTP
   * and the run is published as a document: the room watches it the way it
   * watches strokes, and everyone sees the output, not just whoever pressed Run.
   */
  private async runCode(request: ExecutionRequest): Promise<void> {
    const entry = doc(this.codeRuns);
    const started: CodeRunDoc = {
      byPeerId: this.peerId,
      byDisplayName: this.options.displayName,
      language: request.language,
      startedAt: Date.now(),
    };
    await setDoc(entry, started);
    try {
      const response = await fetch(`${EXECUTION_URL}/execute`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...request, roomId: this.options.roomId }),
      });
      const body = (await response.json()) as ExecutionResult & {
        stdout?: string;
        stderr?: string;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(body.error ?? `The sandbox answered ${response.status}.`);
      }
      await setDoc(
        entry,
        {
          stdout: body.stdout ?? '',
          stderr: body.stderr ?? '',
          exitCode: body.exitCode ?? null,
          timedOut: body.timedOut ?? false,
          error: null,
          finished: true,
        },
        { merge: true },
      );
    } catch (cause) {
      await setDoc(
        entry,
        { error: (cause as Error).message, exitCode: null, timedOut: false, finished: true },
        { merge: true },
      );
    }
  }

  private subscribeCodeRuns(): void {
    const ordered = query(this.codeRuns, orderBy('startedAt'));
    const unsubscribe = onSnapshot(ordered, (snapshot) => {
      for (const change of snapshot.docChanges()) {
        if (change.type === 'removed') {
          this.runOutput.delete(change.doc.id);
          continue;
        }
        const runId = change.doc.id;
        const run = change.doc.data() as CodeRunDoc;
        if (change.type === 'added') {
          this.runOutput.set(runId, { stdout: 0, stderr: 0 });
          this.emitter.dispatch('code:run:started', {
            runId,
            byPeerId: run.byPeerId,
            byDisplayName: run.byDisplayName,
            language: run.language,
          });
        }
        this.dispatchRunOutput(runId, run);
        if (run.finished) {
          this.runOutput.delete(runId);
          this.emitter.dispatch('code:run:finished', {
            runId,
            exitCode: run.exitCode ?? null,
            timedOut: run.timedOut ?? false,
            error: run.error ?? null,
          });
        }
      }
    });
    this.unsubscribers.push(unsubscribe);
  }

  private dispatchRunOutput(runId: string, run: CodeRunDoc): void {
    const seen = this.runOutput.get(runId) ?? { stdout: 0, stderr: 0 };
    for (const stream of ['stdout', 'stderr'] as const) {
      const text = run[stream] ?? '';
      if (text.length > seen[stream]) {
        this.emitter.dispatch('code:output', {
          runId,
          stream,
          text: text.slice(seen[stream]),
        });
        seen[stream] = text.length;
      }
    }
    this.runOutput.set(runId, seen);
  }

  /** Keeps the newest cursor position and writes at most one document per tick. */
  private sendAwareness(update: string): void {
    this.pendingAwareness = update;
    if (this.awarenessTimer) {
      return;
    }
    this.awarenessTimer = setTimeout(() => {
      this.awarenessTimer = null;
      const pending = this.pendingAwareness;
      this.pendingAwareness = null;
      if (pending) {
        void updateDoc(this.selfRef(), { codeAwareness: pending });
      }
    }, AWARENESS_THROTTLE_MS);
  }

  private async askAssistant(ask: { requestId: string; question: string }): Promise<void> {
    const entry = doc(this.assistantTurns, ask.requestId);
    await setDoc(entry, { question: ask.question, startedAt: Date.now() });
    try {
      const [turns, chats, roomSnap] = await Promise.all([
        getDocs(query(this.transcript, orderBy('startedAt'))),
        getDocs(query(this.messages, orderBy('sentAt'))),
        getDoc(this.room),
      ]);
      const response = await fetch(`${EXECUTION_URL}/assistant`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          meetingId: this.options.roomId,
          roomId: this.options.roomId,
          question: ask.question,
          transcript: turns.docs
            .map((item) => normalizeTranscriptSegment(item.data()))
            .filter((segment): segment is NonNullable<typeof segment> => segment !== null)
            .map((segment) => ({
              displayName: segment.displayName,
              text: segment.text,
              startedAt: segment.startedAt,
            })),
          notes: ((roomSnap.data() as RoomDoc | undefined)?.notes ?? '') as string,
          messages: chats.docs.map((item) => {
            const data = item.data() as MessageDoc;
            return { text: data.text, sentAt: data.sentAt };
          }),
        }),
      });
      const body = (await response.json()) as {
        text?: string;
        actions?: StructuredAction[];
        error?: string;
      };
      if (!response.ok) {
        throw new Error(body.error ?? `The assistant answered ${response.status}.`);
      }
      await setDoc(
        entry,
        { text: body.text ?? '', actions: body.actions ?? [], error: null, finished: true },
        { merge: true },
      );
    } catch (cause) {
      await setDoc(entry, { error: (cause as Error).message, finished: true }, { merge: true });
    }
  }

  private subscribeAssistant(): void {
    const unsubscribe = onSnapshot(this.assistantTurns, (snapshot) => {
      for (const change of snapshot.docChanges()) {
        if (change.type === 'removed') {
          continue;
        }
        const requestId = change.doc.id;
        const data = change.doc.data() as {
          text?: string;
          actions?: StructuredAction[];
          error?: string | null;
          finished?: boolean;
        };
        if (!data.finished) {
          continue;
        }
        if (data.error) {
          this.emitter.dispatch('assistant:error', { requestId, error: data.error });
        } else {
          if (data.text) {
            this.emitter.dispatch('assistant:token', { requestId, text: data.text });
          }
          this.emitter.dispatch('assistant:done', {
            requestId,
            actions: data.actions ?? [],
          });
        }
      }
    });
    this.unsubscribers.push(unsubscribe);
  }

  private subscribeTranscript(): void {
    const ordered = query(this.transcript, orderBy('startedAt'));
    const unsubscribe = onSnapshot(ordered, (snapshot) => {
      for (const change of snapshot.docChanges()) {
        if (change.type !== 'added') {
          continue;
        }
        const segment = normalizeTranscriptSegment(change.doc.data());
        if (segment) {
          this.emitter.dispatch('transcript:segment', segment);
        }
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
    switch (type) {
      case 'command':
        this.emitter.dispatch('host:command', payload as HostCommand);
        return;
      case 'ice':
        this.emitter.dispatch('signal:ice', {
          fromPeerId: from,
          candidate: payload as RTCIceCandidateInit,
        });
        return;
      default:
        this.emitter.dispatch(type === 'offer' ? 'signal:offer' : 'signal:answer', {
          fromPeerId: from,
          description: payload as RTCSessionDescriptionInit,
        });
    }
  }
}

export function createFirestoreSignaling(db: Firestore): SignalingFactory {
  return (options) => new FirestoreChannel(db, options);
}
