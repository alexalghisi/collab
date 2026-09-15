export interface GoogleProfile {
  readonly sub: string;
  readonly email: string;
  readonly displayName: string;
  readonly photoURL: string | null;
}

interface TokenInfo {
  readonly aud?: unknown;
  readonly email?: unknown;
  readonly email_verified?: unknown;
  readonly name?: unknown;
  readonly picture?: unknown;
  readonly sub?: unknown;
}

export type GoogleTokenLookup = (token: string) => Promise<TokenInfo>;

async function lookupIdToken(idToken: string): Promise<TokenInfo> {
  return fetchTokenInfo(`id_token=${encodeURIComponent(idToken)}`);
}

async function lookupAccessToken(accessToken: string): Promise<TokenInfo> {
  return fetchTokenInfo(`access_token=${encodeURIComponent(accessToken)}`);
}

async function fetchTokenInfo(query: string): Promise<TokenInfo> {
  const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?${query}`);
  if (!response.ok) {
    throw new Error('Google could not verify that sign-in.');
  }
  return (await response.json()) as TokenInfo;
}

function googleAudiences(): string[] {
  return [
    process.env.GOOGLE_CLIENT_ID,
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
  ]
    .map((value) => value?.trim() ?? '')
    .filter((value) => value.length > 0);
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function profileFrom(info: TokenInfo): GoogleProfile {
  const verified = info.email_verified === true || info.email_verified === 'true';
  const email = asString(info.email).trim().toLowerCase();
  const sub = asString(info.sub);
  if (!verified || !email || !sub) {
    throw new Error('Google did not provide a verified email.');
  }
  return {
    sub,
    email,
    displayName: asString(info.name).trim() || email.split('@')[0] || 'Member',
    photoURL: asString(info.picture) || null,
  };
}

async function verify(token: string, lookup: GoogleTokenLookup): Promise<GoogleProfile> {
  const allowed = googleAudiences();
  if (allowed.length === 0) {
    throw new Error('Google sign-in is not configured.');
  }
  const info = await lookup(token);
  const aud = asString(info.aud);
  if (!allowed.includes(aud)) {
    throw new Error('Google sign-in is not configured for this app.');
  }
  return profileFrom(info);
}

export async function verifyGoogleIdToken(
  idToken: string,
  lookup: GoogleTokenLookup = lookupIdToken,
): Promise<GoogleProfile> {
  return verify(idToken, lookup ?? lookupIdToken);
}

export async function verifyGoogleAccessToken(
  accessToken: string,
  lookup: GoogleTokenLookup = lookupAccessToken,
): Promise<GoogleProfile> {
  return verify(accessToken, lookup ?? lookupAccessToken);
}
