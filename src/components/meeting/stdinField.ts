/** One compact line, then one line of growth, until the field scrolls. */
export const STDIN_LINE_HEIGHT = 18;
export const STDIN_VERTICAL_PAD = 20;
export const STDIN_MAX_HEIGHT = 160;

export function stdinFieldHeight(value: string): number {
  const lines = value === '' ? 1 : value.split('\n').length;
  return Math.min(STDIN_MAX_HEIGHT, lines * STDIN_LINE_HEIGHT + STDIN_VERTICAL_PAD);
}
