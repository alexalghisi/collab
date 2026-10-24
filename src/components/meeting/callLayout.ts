/** Phones and small tablets, including a 768px-wide frame. */
export const COMPACT_CALL_WIDTH = 768;

export function isCompactCall(width: number): boolean {
  return width <= COMPACT_CALL_WIDTH;
}

/** The shared editor takes the whole stage; video moves into a thumbnail. */
export function codeFillsScreen(width: number, stage: string): boolean {
  return stage === 'code' && isCompactCall(width);
}

export function clampEditorFont(size: number): number {
  return Math.min(32, Math.max(12, Math.round(size)));
}
