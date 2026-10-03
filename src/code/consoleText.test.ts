import { describe, expect, it } from 'vitest';
import { consoleStreams, consoleText } from './consoleText';

describe('consoleText', () => {
  it('keeps printed output and names an empty stream so the console is never blank', () => {
    expect(consoleText('42\n')).toBe('42\n');
    expect(consoleText('')).toBe('(empty)');
  });
});

describe('consoleStreams', () => {
  it('shows stdout and leaves out empty input and an empty error stream', () => {
    expect(consoleStreams({ stdin: '', stdout: '35\n', stderr: '' })).toEqual([
      { label: 'stdout', text: '35\n', error: false },
    ]);
  });

  it('keeps stdin and stderr when the program actually used them', () => {
    expect(consoleStreams({ stdin: '4\n', stdout: '', stderr: 'boom' })).toEqual([
      { label: 'stdin', text: '4\n', error: false },
      { label: 'stdout', text: '(empty)', error: false },
      { label: 'stderr', text: 'boom', error: true },
    ]);
  });
});
