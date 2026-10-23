import { describe, expect, it } from 'vitest';
import { inlineSpans, parseStatement } from './markdown';

describe('statement markdown', () => {
  it('turns a collaborare.ro statement into a heading and paragraphs', () => {
    const blocks = parseStatement(
      '## Cerință\n\nScrie subprogramul `int palindrom(long long n)` care\nîntoarce 1.\n\nProblemă de antrenament.',
    );
    expect(blocks).toEqual([
      { kind: 'heading', level: 2, spans: [{ kind: 'text', text: 'Cerință' }] },
      {
        kind: 'paragraph',
        spans: [
          { kind: 'text', text: 'Scrie subprogramul ' },
          { kind: 'code', text: 'int palindrom(long long n)' },
          { kind: 'text', text: ' care întoarce 1.' },
        ],
      },
      { kind: 'paragraph', spans: [{ kind: 'text', text: 'Problemă de antrenament.' }] },
    ]);
  });

  it('keeps fenced code and bullets, drops image and math markup', () => {
    const blocks = parseStatement(
      '- primul\n- **al doilea**\n\n```cpp\nint a;\n  a++;\n```\n![fig](https://x/y.png) Aria $n^2$.',
    );
    expect(blocks).toEqual([
      { kind: 'bullet', spans: [{ kind: 'text', text: 'primul' }] },
      { kind: 'bullet', spans: [{ kind: 'bold', text: 'al doilea' }] },
      { kind: 'code', text: 'int a;\n  a++;' },
      { kind: 'paragraph', spans: [{ kind: 'text', text: 'Aria n^2.' }] },
    ]);
  });

  it('leaves plain text as one span', () => {
    expect(inlineSpans('Prima linie: q.')).toEqual([{ kind: 'text', text: 'Prima linie: q.' }]);
  });
});
