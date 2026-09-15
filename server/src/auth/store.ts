import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

export interface StoredUser {
  readonly uid: string;
  readonly email: string;
  readonly displayName: string;
  readonly passwordHash: string;
}

interface UserFile {
  readonly users: StoredUser[];
}

export class UserStore {
  private users = new Map<string, StoredUser>();

  constructor(private readonly path: string) {
    this.load();
  }

  findByEmail(email: string): StoredUser | undefined {
    return this.users.get(normalizeEmail(email));
  }

  create(input: {
    email: string;
    displayName: string;
    passwordHash: string;
  }): StoredUser {
    const email = normalizeEmail(input.email);
    const user: StoredUser = {
      uid: randomUUID(),
      email,
      displayName: input.displayName.trim(),
      passwordHash: input.passwordHash,
    };
    this.users.set(email, user);
    this.save();
    return user;
  }

  private load(): void {
    if (!existsSync(this.path)) {
      return;
    }
    try {
      const parsed = JSON.parse(readFileSync(this.path, 'utf8')) as UserFile;
      for (const user of parsed.users ?? []) {
        this.users.set(user.email, user);
      }
    } catch {
      this.users.clear();
    }
  }

  private save(): void {
    mkdirSync(dirname(this.path), { recursive: true });
    const body: UserFile = { users: [...this.users.values()] };
    writeFileSync(this.path, `${JSON.stringify(body, null, 2)}\n`);
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
