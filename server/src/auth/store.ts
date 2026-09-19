import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';

export interface StoredUser {
  readonly uid: string;
  readonly email: string;
  readonly displayName: string;
  readonly passwordHash: string | null;
  readonly googleSub: string | null;
}

export interface UserFile {
  readonly users: StoredUser[];
}

export interface RemoteUserStore {
  pull(): Promise<UserFile | null>;
  push(file: UserFile): Promise<void>;
}

export class UserStore {
  private users = new Map<string, StoredUser>();

  constructor(
    private readonly path: string,
    private readonly remote?: RemoteUserStore,
  ) {
    this.load();
  }

  /** Waits for the cloud copy, if any, so a fresh Render box sees yesterday's sign-ups. */
  async ready(): Promise<void> {
    if (!this.remote) {
      return;
    }
    const file = await this.remote.pull();
    if (file && file.users.length > 0) {
      this.replace(file);
      this.writeFile();
    } else if (this.users.size > 0) {
      await this.remote.push(this.snapshot());
    }
  }

  findByEmail(email: string): StoredUser | undefined {
    return this.users.get(normalizeEmail(email));
  }

  findByGoogleSub(sub: string): StoredUser | undefined {
    for (const user of this.users.values()) {
      if (user.googleSub === sub) {
        return user;
      }
    }
    return undefined;
  }

  create(input: {
    email: string;
    displayName: string;
    passwordHash: string | null;
    googleSub?: string | null;
  }): StoredUser {
    const email = normalizeEmail(input.email);
    const user: StoredUser = {
      uid: randomUUID(),
      email,
      displayName: input.displayName.trim(),
      passwordHash: input.passwordHash,
      googleSub: input.googleSub ?? null,
    };
    this.users.set(email, user);
    this.save();
    return user;
  }

  linkGoogle(input: { email: string; displayName: string; googleSub: string }): StoredUser {
    const existing = this.findByGoogleSub(input.googleSub) ?? this.findByEmail(input.email);
    if (!existing) {
      return this.create({
        email: input.email,
        displayName: input.displayName,
        passwordHash: null,
        googleSub: input.googleSub,
      });
    }
    const updated: StoredUser = {
      ...existing,
      googleSub: input.googleSub,
      displayName: existing.displayName || input.displayName.trim(),
    };
    this.users.set(existing.email, updated);
    this.save();
    return updated;
  }

  private replace(file: UserFile): void {
    this.users.clear();
    for (const user of file.users ?? []) {
      if (typeof user.email !== 'string' || user.email.length === 0) {
        continue;
      }
      const email = normalizeEmail(user.email);
      this.users.set(email, {
        uid: typeof user.uid === 'string' ? user.uid : randomUUID(),
        email,
        displayName: typeof user.displayName === 'string' ? user.displayName : email,
        passwordHash: user.passwordHash ?? null,
        googleSub: user.googleSub ?? null,
      });
    }
  }

  private snapshot(): UserFile {
    return { users: [...this.users.values()] };
  }

  private load(): void {
    if (!existsSync(this.path)) {
      return;
    }
    try {
      this.replace(JSON.parse(readFileSync(this.path, 'utf8')) as UserFile);
    } catch {
      this.users.clear();
    }
  }

  private writeFile(): void {
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, `${JSON.stringify(this.snapshot(), null, 2)}\n`);
  }

  private save(): void {
    this.writeFile();
    if (this.remote) {
      void this.remote.push(this.snapshot());
    }
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function keyFromSecret(secret: string): Buffer {
  return createHash('sha256').update(secret).digest();
}

export function sealUserFile(file: UserFile, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFromSecret(secret), iv);
  const plain = Buffer.from(JSON.stringify(file), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    v: 1,
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: encrypted.toString('base64'),
  });
}

export function openUserFile(raw: string, secret: string): UserFile | null {
  try {
    const parsed = JSON.parse(raw) as {
      v?: number;
      iv?: string;
      tag?: string;
      data?: string;
      users?: StoredUser[];
    };
    if (Array.isArray(parsed.users)) {
      return { users: parsed.users };
    }
    if (parsed.v !== 1 || !parsed.iv || !parsed.tag || !parsed.data) {
      return null;
    }
    const decipher = createDecipheriv(
      'aes-256-gcm',
      keyFromSecret(secret),
      Buffer.from(parsed.iv, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(parsed.tag, 'base64'));
    const plain = Buffer.concat([
      decipher.update(Buffer.from(parsed.data, 'base64')),
      decipher.final(),
    ]);
    return JSON.parse(plain.toString('utf8')) as UserFile;
  } catch {
    return null;
  }
}

export function gistUserStore(
  gistId: string,
  token: string,
  secret: string,
  fetchImpl: typeof fetch = fetch,
): RemoteUserStore {
  const url = `https://api.github.com/gists/${gistId}`;
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
  };
  return {
    async pull() {
      const response = await fetchImpl(url, { headers });
      if (response.status === 404) {
        return null;
      }
      if (!response.ok) {
        throw new Error(`account store answered ${response.status}`);
      }
      const body = (await response.json()) as {
        files?: Record<string, { content?: string }>;
      };
      const content = Object.values(body.files ?? {})[0]?.content;
      return content ? openUserFile(content, secret) : null;
    },
    async push(file) {
      const response = await fetchImpl(url, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: { 'collab-users.json': { content: sealUserFile(file, secret) } },
        }),
      });
      if (!response.ok) {
        throw new Error(`account store answered ${response.status}`);
      }
    },
  };
}

export function httpUserStore(
  url: string,
  secret: string,
  fetchImpl: typeof fetch = fetch,
): RemoteUserStore {
  return {
    async pull() {
      const response = await fetchImpl(url, { headers: { Accept: 'application/json' } });
      if (response.status === 404) {
        return null;
      }
      if (!response.ok) {
        throw new Error(`account store answered ${response.status}`);
      }
      return openUserFile(await response.text(), secret);
    },
    async push(file) {
      const response = await fetchImpl(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: sealUserFile(file, secret),
      });
      if (!response.ok) {
        throw new Error(`account store answered ${response.status}`);
      }
    },
  };
}

export function createUserStoreFromEnv(
  path: string,
  env: Partial<NodeJS.ProcessEnv> = process.env,
): UserStore {
  const secret = env.AUTH_SECRET?.trim() || 'collab-dev-auth-secret';
  const gistId = env.AUTH_GIST_ID?.trim();
  const gistToken = env.AUTH_GIST_TOKEN?.trim();
  if (gistId && gistToken) {
    return new UserStore(path, gistUserStore(gistId, gistToken, secret));
  }
  const url = env.AUTH_STORE_URL?.trim();
  return new UserStore(path, url ? httpUserStore(url, secret) : undefined);
}
