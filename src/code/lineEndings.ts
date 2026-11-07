/**
 * The shared code always uses LF. Monaco picks CRLF on Windows, and an editor
 * counting a line break as two characters while the shared text counts one
 * makes every edit below the first line land on the wrong characters.
 */
export function toLf(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

/** Monaco's `EndOfLineSequence.LF`. */
export const MONACO_EOL_LF = 0;
