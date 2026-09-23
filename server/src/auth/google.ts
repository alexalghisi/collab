export interface GoogleProfile {
  readonly sub: string;
  readonly email: string;
  readonly displayName: string;
  readonly photoURL: string | null;
}

interface TokenInfo {
  readonly aud?: unknown;
  readonly azp?: unknown;
  readonly audience?: unknown;
  readonly email?: unknown;
  readonly email_verified?: unknown;
  readonly verified_email?: unknown;
  readonly name?: unknown;
  readonly picture?: unknown;
  readonly sub?: unknown;
  readonly user_id?: unknown;
}

export type GoogleTokenLookup = (token: string) => Promise<TokenInfo>;

async function lookupIdToken(idToken: string): Promise<TokenInfo> {
  return fetchTokenInfo(`id_token=${encodeURIComponent(idToken)}`);
}

async function lookupAccessToken(accessToken: string): Promise<TokenInfo> {
  const info = await fetchTokenInfo(`access_token=${encodeURIComponent(accessToken)}`);
  if (asString(info.email) && subjectOf(info)) {
    return info;
  }
  const user = await fetchUserInfo(accessToken);
  return {
    ...info,
    email: asString(info.email) || asString(user.email),
    email_verified: info.email_verified ?? info.verified_email ?? user.email_verified,
    verified_email: info.verified_email ?? user.verified_email,
    name: asString(info.name) || asString(user.name),
    picture: asString(info.picture) || asString(user.picture),
    sub: subjectOf(info) || subjectOf(user),
  };
}

async function fetchUserInfo(accessToken: string): Promise<TokenInfo> {
  const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error('Google could not verify that sign-in.');
  }
  return (await response.json()) as TokenInfo;
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

function audienceOf(info: TokenInfo): string {
  return asString(info.aud) || asString(info.audience) || asString(info.azp);
}

function subjectOf(info: TokenInfo): string {
  return asString(info.sub) || asString(info.user_id);
}

function emailVerified(info: TokenInfo): boolean {
  return (
    info.email_verified === true ||
    info.email_verified === 'true' ||
    info.verified_email === true ||
    info.verified_email === 'true'
  );
}

function profileFrom(info: TokenInfo): GoogleProfile {
  const email = asString(info.email).trim().toLowerCase();
  const sub = subjectOf(info);
  if (!emailVerified(info) || !email || !sub) {
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
  const aud = audienceOf(info);
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
