import { describe, expect, it } from 'vitest';
import { parseOAuthRedirect } from './googleOAuthPopup';

describe('parseOAuthRedirect', () => {
  it('reads the token Google appends to the redirect', () => {
    expect(
      parseOAuthRedirect(
        '#state=collab-oauth.abc&access_token=ya29.x&expires_in=3599&token_type=Bearer',
      ),
    ).toEqual({
      state: 'collab-oauth.abc',
      accessToken: 'ya29.x',
      expiresIn: 3599,
      error: undefined,
    });
  });

  it('reads an error redirect', () => {
    expect(parseOAuthRedirect('#state=collab-oauth.abc&error=access_denied')).toMatchObject({
      state: 'collab-oauth.abc',
      error: 'access_denied',
      accessToken: undefined,
    });
  });

  it('ignores hashes that are not ours', () => {
    expect(parseOAuthRedirect('')).toBeNull();
    expect(parseOAuthRedirect('#access_token=ya29.x&state=someone-else')).toBeNull();
    expect(parseOAuthRedirect('#section-2')).toBeNull();
  });
});
