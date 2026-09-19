import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_APP_URL, publicAppUrl, sendAppHome } from './home';

describe('publicAppUrl', () => {
  it('uses the hosted Pages app when nothing is configured', () => {
    expect(publicAppUrl({})).toBe(DEFAULT_APP_URL);
  });

  it('prefers PUBLIC_APP_URL and drops a trailing slash', () => {
    expect(publicAppUrl({ PUBLIC_APP_URL: 'https://collab.example/' })).toBe(
      'https://collab.example',
    );
  });
});

describe('sendAppHome', () => {
  it('sends the browser to the app instead of a 404', () => {
    const redirect = vi.fn();
    sendAppHome({} as never, { redirect } as never);
    expect(redirect).toHaveBeenCalledWith(302, DEFAULT_APP_URL);
  });
});
