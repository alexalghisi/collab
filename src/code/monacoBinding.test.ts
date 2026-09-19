import { beforeEach, describe, expect, it } from 'vitest';
import type { SignalingChannel } from '../signaling/SignalingChannel';
import { SharedCodeDocument, type CodePresence } from './SharedCodeDocument';
import {
  MonacoTextBinding,
  decorationsFor,
  type Decoration,
  type EditorApi,
  type EditorModel,
  type ModelContentChangedEvent,
  type MonacoApi,
} from './monacoBinding';

class Range {
  constructor(
    readonly startLineNumber: number,
    readonly startColumn: number,
    readonly endLineNumber: number,
    readonly endColumn: number,
  ) {}
}

const monaco: MonacoApi = { Range };

/** Enough of a Monaco model to exercise the binding: a string plus offsets. */
class FakeModel implements EditorModel {
  private listeners: Array<(event: ModelContentChangedEvent) => void> = [];
  private version = 1;

  constructor(private value = '') {}

  getValue(): string {
    return this.value;
  }

  getVersionId(): number {
    return this.version;
  }

  getPositionAt(offset: number): { lineNumber: number; column: number } {
    const clamped = Math.min(Math.max(offset, 0), this.value.length);
    const lines = this.value.slice(0, clamped).split('\n');
    return { lineNumber: lines.length, column: lines[lines.length - 1].length + 1 };
  }

  getOffsetAt(position: unknown): number {
    const { lineNumber, column } = position as { lineNumber: number; column: number };
    const lines = this.value.split('\n');
    return (
      lines.slice(0, lineNumber - 1).reduce((total, line) => total + line.length + 1, 0) +
      column -
      1
    );
  }

  applyEdits(edits: Array<{ range: unknown; text: string }>): void {
    for (const edit of edits) {
      const range = edit.range as Range;
      const start = this.getOffsetAt({
        lineNumber: range.startLineNumber,
        column: range.startColumn,
      });
      const end = Math.min(
        this.value.length,
        this.getOffsetAt({ lineNumber: range.endLineNumber, column: range.endColumn }),
      );
      this.value = this.value.slice(0, start) + edit.text + this.value.slice(end);
    }
    this.version += 1;
  }

  /** Mimics a user typing: the model changes, then the change is announced. */
  type(offset: number, text: string, replaced = 0): void {
    this.value = this.value.slice(0, offset) + text + this.value.slice(offset + replaced);
    this.version += 1;
    const event = { changes: [{ rangeOffset: offset, rangeLength: replaced, text }] };
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  onDidChangeContent(listener: (event: ModelContentChangedEvent) => void) {
    this.listeners.push(listener);
    return {
      dispose: () => {
        this.listeners = this.listeners.filter((entry) => entry !== listener);
      },
    };
  }
}

class FakeEditor implements EditorApi {
  selection: { start: number; end: number } | null = { start: 0, end: 0 };
  private cursorListeners: Array<() => void> = [];

  constructor(readonly model: FakeModel) {}

  getModel(): EditorModel {
    return this.model;
  }

  onDidChangeCursorSelection(listener: () => void) {
    this.cursorListeners.push(listener);
    return { dispose: () => (this.cursorListeners = []) };
  }

  getSelection() {
    const selection = this.selection;
    if (!selection) {
      return null;
    }
    return {
      getStartPosition: () => this.model.getPositionAt(selection.start),
      getEndPosition: () => this.model.getPositionAt(selection.end),
    };
  }

  createDecorationsCollection(decorations: Decoration[]) {
    let current = decorations;
    return {
      set: (next: Decoration[]) => {
        current = next;
      },
      clear: () => {
        current = [];
      },
      get: () => current,
    };
  }

  moveCursor(start: number, end = start): void {
    this.selection = { start, end };
    for (const listener of this.cursorListeners) {
      listener();
    }
  }
}

class SilentChannel implements SignalingChannel {
  on(): void {}
  emit(): void {}
  connect(): Promise<void> {
    return Promise.resolve();
  }
  disconnect(): void {}

  upload(): Promise<never> {
    throw new Error('this test never shares a file');
  }

  sendInvite(): Promise<never> {
    throw new Error('this test never sends an invite');
  }
}

describe('MonacoTextBinding', () => {
  let document: SharedCodeDocument;
  let model: FakeModel;
  let editor: FakeEditor;
  let binding: MonacoTextBinding;

  const bind = (initial = '') => {
    model = new FakeModel(initial);
    editor = new FakeEditor(model);
    binding = new MonacoTextBinding(document, editor, monaco);
  };

  beforeEach(() => {
    document = new SharedCodeDocument(new SilentChannel(), { peerId: 'a', displayName: 'Ada' });
  });

  it('sends what the participant types to the shared text', () => {
    bind();

    model.type(0, 'const answer = 42;');

    expect(document.text.toString()).toBe('const answer = 42;');
  });

  it('applies a replacement as a delete and an insert', () => {
    document.text.insert(0, 'const answer = 41;');
    bind('const answer = 41;');

    model.type(15, '42', 2);

    expect(document.text.toString()).toBe('const answer = 42;');
  });

  it('writes a remote insertion into the model at the right offset', () => {
    document.text.insert(0, 'one\nthree\n');
    bind('one\nthree\n');

    document.applyState(remoteEdit(document, (text) => text.insert(4, 'two\n')));

    expect(model.getValue()).toBe('one\ntwo\nthree\n');
  });

  it('writes a remote deletion into the model', () => {
    document.text.insert(0, 'keep\nremove\n');
    bind('keep\nremove\n');

    document.applyState(remoteEdit(document, (text) => text.delete(5, 7)));

    expect(model.getValue()).toBe('keep\n');
  });

  it('does not feed a remote change back into the document', () => {
    document.text.insert(0, 'start');
    bind('start');
    const before = document.text.toString();

    document.applyState(remoteEdit(document, (text) => text.insert(5, '!')));

    expect(model.getValue()).toBe('start!');
    expect(document.text.toString()).toBe(`${before}!`);
  });

  it('adopts an empty document from the editor rather than clearing it', () => {
    bind('// scratch');

    expect(document.text.toString()).toBe('// scratch');
  });

  it('takes the shared text over an editor that starts with something else', () => {
    document.text.insert(0, 'shared wins');
    bind('local loses');

    expect(model.getValue()).toBe('shared wins');
    expect(document.text.toString()).toBe('shared wins');
  });

  it('publishes the local selection as offsets', () => {
    document.text.insert(0, 'select me');
    bind('select me');

    editor.moveCursor(0, 6);

    expect(document.awareness.getLocalState()?.selection).toEqual({ start: 0, end: 6 });
  });

  it('stops translating once destroyed', () => {
    bind();
    binding.destroy();

    model.type(0, 'ignored');

    expect(document.text.toString()).toBe('');
  });
});

/** Produces an update from a second document, as a remote peer would. */
function remoteEdit(local: SharedCodeDocument, edit: (text: SharedCodeDocument['text']) => void) {
  const mirror = new SharedCodeDocument(new SilentChannel(), { peerId: 'b', displayName: 'Linus' });
  mirror.applyState(local.encodeState());
  edit(mirror.text);
  const state = mirror.encodeState();
  mirror.destroy();
  return state;
}

describe('decorationsFor', () => {
  const model = new FakeModel('const answer = 42;\nreturn answer;\n');
  const presence = (selection: { start: number; end: number } | null): CodePresence => ({
    clientId: 7,
    peerId: 'b',
    displayName: 'Linus',
    color: '#60a5fa',
    selection,
  });

  it('places a remote selection on the right lines and columns', () => {
    const [highlight] = decorationsFor(
      [presence({ start: 19, end: 25 })],
      model,
      monaco,
      () => 'x',
    );

    expect(highlight.range).toMatchObject({
      startLineNumber: 2,
      startColumn: 1,
      endLineNumber: 2,
      endColumn: 7,
    });
    expect(highlight.options.className).toBe('x');
  });

  it('pins the name to one caret so a wide selection does not stamp every line', () => {
    const marks = decorationsFor([presence({ start: 0, end: 25 })], model, monaco, () => 'x');

    expect(marks).toHaveLength(2);
    expect(marks[0].options.className).toBe('x');
    expect(marks[1].options.className).toBe('x-label');
    expect(marks[1].range).toMatchObject({
      startLineNumber: 2,
      startColumn: 7,
      endLineNumber: 2,
      endColumn: 7,
    });
    expect(marks[1].options.hoverMessage.value).toBe('Linus');
  });

  it('labels a collapsed caret without a highlight', () => {
    const marks = decorationsFor([presence({ start: 0, end: 0 })], model, monaco, () => 'x');

    expect(marks).toHaveLength(1);
    expect(marks[0].options.className).toBe('x-label');
    expect(marks[0].options.hoverMessage.value).toBe('Linus');
  });

  it('skips a participant who has no cursor yet', () => {
    expect(decorationsFor([presence(null)], model, monaco, () => 'x')).toEqual([]);
  });

  it('skips a stale selection that points past the end of the text', () => {
    expect(decorationsFor([presence({ start: 900, end: 950 })], model, monaco, () => 'x')).toEqual(
      [],
    );
  });
});
