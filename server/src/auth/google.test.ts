import { afterEach, describe, expect, it, vi } from 'vitest';
import { verifyGoogleAccessToken, verifyGoogleIdToken } from './google';

const CLIENT_ID = 'collab.apps.googleusercontent.com';

describe('Google token verification', () => {
  const previous = process.env.GOOGLE_CLIENT_ID;

  afterEach(() => {
    if (previous === undefined) {
      delete process.env.GOOGLE_CLIENT_ID;
    } else {
      process.env.GOOGLE_CLIENT_ID = previous;
    }
  });

  it('returns the profile when the audience matches a configured client', async () => {
    process.env.GOOGLE_CLIENT_ID = CLIENT_ID;
    const profile = await verifyGoogleIdToken('id-token', async () => ({
      aud: CLIENT_ID,
      email: 'Ada@University.edu',
      email_verified: true,
      name: 'Ada Lovelace',
      picture: 'https://example.com/ada.png',
      sub: 'sub-ada',
    }));
    expect(profile).toEqual({
      sub: 'sub-ada',
      email: 'ada@university.edu',
      displayName: 'Ada Lovelace',
      photoURL: 'https://example.com/ada.png',
    });
  });

  it('rejects a token issued for a different client', async () => {
    process.env.GOOGLE_CLIENT_ID = CLIENT_ID;
    await expect(
      verifyGoogleAccessToken('access-token', async () => ({
        aud: 'other.apps.googleusercontent.com',
        email: 'ada@university.edu',
        email_verified: 'true',
        name: 'Ada',
        sub: 'sub-ada',
      })),
    ).rejects.toThrow('Google sign-in is not configured for this app.');
  });

  it('accepts an access token that uses the older tokeninfo field names', async () => {
    process.env.GOOGLE_CLIENT_ID = CLIENT_ID;
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          azp: CLIENT_ID,
          audience: CLIENT_ID,
          user_id: 'sub-ada',
          email: 'Ada@University.edu',
          verified_email: true,
          name: 'Ada Lovelace',
          picture: 'https://example.com/ada.png',
        }),
        { status: 200 },
      ),
    );

    await expect(verifyGoogleAccessToken('ya29.token')).resolves.toEqual({
      sub: 'sub-ada',
      email: 'ada@university.edu',
      displayName: 'Ada Lovelace',
      photoURL: 'https://example.com/ada.png',
    });
  });

  it('reads the profile from userinfo when tokeninfo omits the email', async () => {
    process.env.GOOGLE_CLIENT_ID = CLIENT_ID;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('tokeninfo')) {
        return new Response(JSON.stringify({ aud: CLIENT_ID, scope: 'openid email profile' }), {
          status: 200,
        });
      }
      return new Response(
        JSON.stringify({
          sub: 'sub-ada',
          email: 'ada@university.edu',
          email_verified: true,
          name: 'Ada Lovelace',
          picture: 'https://example.com/ada.png',
        }),
        { status: 200 },
      );
    });

    await expect(verifyGoogleAccessToken('ya29.token')).resolves.toEqual({
      sub: 'sub-ada',
      email: 'ada@university.edu',
      displayName: 'Ada Lovelace',
      photoURL: 'https://example.com/ada.png',
    });
  });

  it('rejects an unverified email', async () => {
    process.env.GOOGLE_CLIENT_ID = CLIENT_ID;
    await expect(
      verifyGoogleIdToken('id-token', async () => ({
        aud: CLIENT_ID,
        email: 'ada@university.edu',
        email_verified: false,
        name: 'Ada',
        sub: 'sub-ada',
      })),
    ).rejects.toThrow('Google did not provide a verified email.');
  });
});
