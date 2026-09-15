import { describe, expect, it } from 'vitest';
import { splitMessageLinks } from './links';

describe('splitMessageLinks', () => {
  it('leaves a message with no URL as a single text run', () => {
    expect(splitMessageLinks('hello everyone')).toEqual([
      { kind: 'text', value: 'hello everyone' },
    ]);
  });

  it('turns an https URL in the middle of a sentence into a link', () => {
    expect(
      splitMessageLinks('join https://alexalghisi.github.io/collab/?room=kqz-wrtm-pfa now'),
    ).toEqual([
      { kind: 'text', value: 'join ' },
      {
        kind: 'link',
        value: 'https://alexalghisi.github.io/collab/?room=kqz-wrtm-pfa',
        href: 'https://alexalghisi.github.io/collab/?room=kqz-wrtm-pfa',
      },
      { kind: 'text', value: ' now' },
    ]);
  });

  it('does not swallow the full stop after a URL', () => {
    expect(splitMessageLinks('See https://example.com.')).toEqual([
      { kind: 'text', value: 'See ' },
      { kind: 'link', value: 'https://example.com', href: 'https://example.com/' },
      { kind: 'text', value: '.' },
    ]);
  });

  it('treats a www. host as https', () => {
    expect(splitMessageLinks('www.example.com/meet')).toEqual([
      {
        kind: 'link',
        value: 'www.example.com/meet',
        href: 'https://www.example.com/meet',
      },
    ]);
  });

  it('does not turn a javascript URL into a link', () => {
    expect(splitMessageLinks('javascript:alert(1)')).toEqual([
      { kind: 'text', value: 'javascript:alert(1)' },
    ]);
  });

  it('keeps several links in one message', () => {
    const parts = splitMessageLinks('a http://localhost:4000 and https://example.com/b');
    expect(parts.filter((part) => part.kind === 'link')).toEqual([
      { kind: 'link', value: 'http://localhost:4000', href: 'http://localhost:4000/' },
      { kind: 'link', value: 'https://example.com/b', href: 'https://example.com/b' },
    ]);
  });
});
