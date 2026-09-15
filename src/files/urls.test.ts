import { describe, expect, it } from 'vitest';
import { attachmentHref } from './urls';

describe('attachmentHref', () => {
  it('leaves an absolute URL alone', () => {
    expect(attachmentHref('https://cdn.example/file.pdf')).toBe('https://cdn.example/file.pdf');
  });

  it('resolves a server path against the signaling origin', () => {
    expect(attachmentHref('/files/abc')).toMatch(/\/files\/abc$/);
  });
});
