import { describe, expect, it } from 'vitest';
import { inlineSpans, parseStatement, readableMath } from './markdown';

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
      { kind: 'paragraph', spans: [{ kind: 'text', text: 'Aria n².' }] },
    ]);
  });

  it('leaves plain text as one span', () => {
    expect(inlineSpans('Prima linie: q.')).toEqual([{ kind: 'text', text: 'Prima linie: q.' }]);
  });

  it('writes every requirement the way a person would read it', () => {
    expect(readableMath('n \\in [2, 10^2]')).toBe('n ∈ [2, 10²]');
    expect(readableMath('2 \\le n \\le 10^{2}')).toBe('2 ≤ n ≤ 10²');
    expect(readableMath('26=16 \\cdot 1+5 \\cdot 2=1 \\cdot 10+2 \\cdot 8')).toBe(
      '26 = 16 · 1 + 5 · 2 = 1 · 10 + 2 · 8',
    );
    expect(readableMath('a_1, a_2, \\ldots, a_n')).toBe('a₁, a₂, …, aₙ');
    expect(readableMath('|a_{ij}| \\le 100')).toBe('|aᵢⱼ| ≤ 100');
    expect(readableMath('2^{31}-1')).toBe('2³¹ - 1');
    expect(readableMath('\\sqrt{n}')).toBe('√n');
    expect(readableMath('1 \\leq N \\leq 1 \\ 100')).toBe('1 ≤ N ≤ 1 100');
    const blocks = parseStatement(
      'pentru $n=6$ se obține tabloul $(100,64,36,16,4,0)$.\n\n*Subiect oficial.*\n\nPăstrează `n^2` în cod.',
    );
    expect(blocks).toEqual([
      {
        kind: 'paragraph',
        spans: [{ kind: 'text', text: 'pentru n = 6 se obține tabloul (100,64,36,16,4,0).' }],
      },
      { kind: 'paragraph', spans: [{ kind: 'italic', text: 'Subiect oficial.' }] },
      {
        kind: 'paragraph',
        spans: [
          { kind: 'text', text: 'Păstrează ' },
          { kind: 'code', text: 'n^2' },
          { kind: 'text', text: ' în cod.' },
        ],
      },
    ]);
  });
});
