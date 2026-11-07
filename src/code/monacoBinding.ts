import type * as Y from 'yjs';
import { MONACO_EOL_LF, toLf } from './lineEndings';
import type { CodePresence, SharedCodeDocument } from './SharedCodeDocument';

/**
 * The slice of Monaco's API this binding needs. Typed structurally so the editor
 * package is never imported here: on web it arrives from the mounted editor, and
 * the tests supply a stand-in.
 */
export interface EditorPosition {
  readonly lineNumber: number;
  readonly column: number;
}

export interface EditorModel {
  getValue(): string;
  getVersionId(): number;
  /** Monaco's line-ending switch; `0` is LF. */
  setEOL?(sequence: number): void;
  getPositionAt(offset: number): EditorPosition;
  getOffsetAt(position: EditorPosition): number;
  applyEdits(edits: Array<{ range: CursorRange; text: string }>): void;
  onDidChangeContent(listener: (event: ModelContentChangedEvent) => void): Disposable;
}

export interface ModelContentChangedEvent {
  readonly changes: Array<{
    readonly rangeOffset: number;
    readonly rangeLength: number;
    readonly text: string;
  }>;
}

export interface Disposable {
  dispose(): void;
}

export interface CursorRange {
  readonly startLineNumber: number;
  readonly startColumn: number;
  readonly endLineNumber: number;
  readonly endColumn: number;
}

export interface EditorApi {
  getModel(): EditorModel | null;
  /** `source` is Monaco's: 'keyboard', 'mouse', 'api', 'modelChange', … */
  onDidChangeCursorSelection(listener: (event: CursorSelectionEvent) => void): Disposable;
  /** The caret, which can sit at either end of a selection. */
  getPosition(): EditorPosition | null;
  getSelection(): { getStartPosition(): EditorPosition; getEndPosition(): EditorPosition } | null;
  /**
   * Puts the caret back. `selectionStart*` is the anchor and `position*` is the
   * caret, so a selection dragged backwards survives.
   */
  setSelection(selection: {
    readonly selectionStartLineNumber: number;
    readonly selectionStartColumn: number;
    readonly positionLineNumber: number;
    readonly positionColumn: number;
  }): void;
  createDecorationsCollection(decorations: Decoration[]): DecorationsCollection;
}

export interface CursorSelectionEvent {
  readonly source?: string;
}

/** Monaco moved the caret because the text under it changed, not because its owner did. */
const SHOVED_BY_EDIT = 'modelChange';

export interface Decoration {
  readonly range: CursorRange;
  readonly options: {
    readonly className?: string;
    readonly beforeContentClassName?: string;
    readonly hoverMessage: { readonly value: string };
    readonly stickiness: number;
  };
}

export interface DecorationsCollection {
  set(decorations: Decoration[]): void;
  clear(): void;
}

export interface MonacoApi {
  Range: new (
    startLineNumber: number,
    startColumn: number,
    endLineNumber: number,
    endColumn: number,
  ) => CursorRange;
}

const LOCAL = 'local-editor';

/**
 * Applies a Monaco model's edits to the shared text and the shared text's
 * changes back to the model, without either side echoing the other. The CRDT
 * still does the merging; this only translates between offsets and ranges.
 */
export class MonacoTextBinding {
  private readonly disposables: Disposable[] = [];
  private applyingRemote = false;
  /** Remote edits move the caret, then tell us about it a turn later. */
  private selectionLock = 0;

  constructor(
    private readonly document: SharedCodeDocument,
    private readonly editor: EditorApi,
    private readonly monaco: MonacoApi,
  ) {
    const model = editor.getModel();
    if (!model) {
      throw new Error('the editor has no model to bind');
    }
    this.seed(model);
    this.disposables.push(
      model.onDidChangeContent((event) => {
        const current = this.editor.getModel();
        if (current) {
          this.onModelChange(current, event);
        }
      }),
    );
    this.document.text.observe(this.onTextChange);
    this.disposables.push(
      editor.onDidChangeCursorSelection((event) => {
        const current = this.editor.getModel();
        if (current) {
          this.onCursorChange(current, event.source);
        }
      }),
      { dispose: () => this.document.text.unobserve(this.onTextChange) },
    );
    this.publishSelection(model);
  }

  destroy(): void {
    for (const disposable of this.disposables.splice(0)) {
      disposable.dispose();
    }
  }

  private seed(model: EditorModel): void {
    model.setEOL?.(MONACO_EOL_LF);
    this.document.stripCarriageReturns(LOCAL);
    const shared = this.document.text.toString();
    if (shared === model.getValue()) {
      return;
    }
    if (shared === '') {
      this.document.text.insert(0, toLf(model.getValue()));
      return;
    }
    this.writeModel(model, shared);
  }

  private onModelChange(model: EditorModel, event: ModelContentChangedEvent): void {
    if (this.applyingRemote) {
      return;
    }
    const changes = event.changes
      .slice()
      .sort((left, right) => right.rangeOffset - left.rangeOffset);
    this.document.doc.transact(() => {
      for (const change of changes) {
        if (change.rangeLength > 0) {
          this.document.text.delete(change.rangeOffset, change.rangeLength);
        }
        if (change.text !== '') {
          this.document.text.insert(change.rangeOffset, toLf(change.text));
        }
      }
    }, LOCAL);
    this.publishSelection(model, true);
  }

  private readonly onTextChange = (event: Y.YTextEvent): void => {
    if (event.transaction.origin === LOCAL) {
      return;
    }
    const model = this.editor.getModel();
    if (!model) {
      return;
    }
    if (this.document.text.toString().includes('\r')) {
      // An older client sent CRLF. Its offsets do not match this LF editor, so
      // clean the shared text first, then bring the editor onto it.
      queueMicrotask(() => this.recoverFromCarriageReturns());
      return;
    }
    this.selectionLock += 1;
    this.applyingRemote = true;
    try {
      let offset = 0;
      for (const change of event.delta) {
        if (change.retain !== undefined) {
          offset += change.retain;
        } else if (typeof change.insert === 'string') {
          model.applyEdits([
            {
              range: this.rangeOf(model, offset, offset),
              text: change.insert,
            },
          ]);
          offset += change.insert.length;
        } else if (change.delete !== undefined) {
          model.applyEdits([
            { range: this.rangeOf(model, offset, offset + change.delete), text: '' },
          ]);
        }
      }
      this.alignModel(model);
    } finally {
      this.applyingRemote = false;
    }
    // Monaco pushes a caret that was sitting on the insertion, sometimes after
    // this function has returned. Put it back and ignore that late report.
    this.restoreCaret(model);
    queueMicrotask(() => {
      const current = this.editor.getModel();
      if (current) {
        this.restoreCaret(current);
      }
      const release = () => {
        this.selectionLock = Math.max(0, this.selectionLock - 1);
      };
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => {
          const later = this.editor.getModel();
          if (later) {
            this.restoreCaret(later);
          }
          release();
        });
      } else {
        release();
      }
    });
  };

  private recoverFromCarriageReturns(): void {
    this.document.stripCarriageReturns(LOCAL);
    const model = this.editor.getModel();
    if (!model) {
      return;
    }
    this.alignModel(model);
    this.restoreCaret(model);
  }

  private restoreCaret(model: EditorModel): void {
    const selection = this.document.localSelection();
    if (!selection) {
      return;
    }
    const length = model.getValue().length;
    const headOffset = clampOffset(selection.head ?? selection.end, length);
    const anchorOffset = clampOffset(
      headOffset === selection.start && headOffset !== selection.end
        ? selection.end
        : selection.start,
      length,
    );
    const anchor = model.getPositionAt(anchorOffset);
    const head = model.getPositionAt(headOffset);
    this.applyingRemote = true;
    try {
      this.editor.setSelection({
        selectionStartLineNumber: anchor.lineNumber,
        selectionStartColumn: anchor.column,
        positionLineNumber: head.lineNumber,
        positionColumn: head.column,
      });
    } finally {
      this.applyingRemote = false;
    }
  }

  private alignModel(model: EditorModel): void {
    const shared = this.document.text.toString();
    if (model.getValue() === shared) {
      return;
    }
    this.writeModel(model, shared);
  }

  private writeModel(model: EditorModel, text: string): void {
    this.applyingRemote = true;
    model.applyEdits([
      {
        range: new this.monaco.Range(1, 1, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER),
        text,
      },
    ]);
    this.applyingRemote = false;
  }

  private rangeOf(model: EditorModel, from: number, to: number): CursorRange {
    const start = model.getPositionAt(from);
    const end = model.getPositionAt(to);
    return new this.monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column);
  }

  /**
   * A caret moved by its owner (typing, clicking, arrow keys) is always the
   * truth, even while a remote edit is settling; dropping it is what made a
   * pending restore put the caret back behind the owner's last keystroke.
   * Only Monaco shoving the caret aside for someone else's text is ignored.
   */
  private onCursorChange(model: EditorModel, source: string | undefined): void {
    if (source === SHOVED_BY_EDIT) {
      return;
    }
    const byOwner = source !== undefined && source !== 'api';
    this.publishSelection(model, byOwner);
  }

  private publishSelection(model: EditorModel, fromOwner = false): void {
    if (this.applyingRemote || (this.selectionLock > 0 && !fromOwner)) {
      return;
    }
    const selection = this.editor.getSelection();
    const caret = this.editor.getPosition();
    if (!selection || !caret) {
      return;
    }
    const start = model.getOffsetAt(selection.getStartPosition());
    const end = model.getOffsetAt(selection.getEndPosition());
    this.document.setSelection({
      start,
      end,
      head: model.getOffsetAt(caret),
    });
  }
}

export function decorationsFor(
  cursors: CodePresence[],
  model: EditorModel,
  monaco: MonacoApi,
  classNameOf: (presence: CodePresence) => string,
): Decoration[] {
  const length = model.getValue().length;
  const items: Decoration[] = [];
  for (const presence of cursors) {
    const selection = presence.selection;
    if (!selection) {
      continue;
    }
    const lo = clampOffset(Math.min(selection.start, selection.end), length);
    const hi = clampOffset(Math.max(selection.start, selection.end), length);
    const from = model.getPositionAt(lo);
    const to = model.getPositionAt(hi);
    const head = model.getPositionAt(clampOffset(selection.head ?? selection.end, length));
    const hover = { value: presence.displayName };
    if (lo !== hi) {
      items.push({
        range: new monaco.Range(from.lineNumber, from.column, to.lineNumber, to.column),
        options: { className: classNameOf(presence), hoverMessage: hover, stickiness: 1 },
      });
    }
    items.push({
      range: new monaco.Range(head.lineNumber, head.column, head.lineNumber, head.column),
      options: {
        beforeContentClassName: `${classNameOf(presence)}-caret`,
        hoverMessage: hover,
        stickiness: 1,
      },
    });
  }
  return items;
}

function clampOffset(offset: number, length: number): number {
  if (offset < 0) {
    return 0;
  }
  return offset > length ? length : offset;
}
