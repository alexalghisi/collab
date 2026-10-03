import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildInviteLink } from './invite';

describe('buildInviteLink', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not mail a github.io join link', () => {
    vi.stubGlobal('window', {
      location: {
        href: 'https://alexalghisi.github.io/collab/?room=drp-rksc-qei',
        origin: 'https://alexalghisi.github.io',
      },
    });
    expect(buildInviteLink('drp-rksc-qei')).toBe('https://collaborare.ro/?room=drp-rksc-qei');
  });
});
