import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import {
  validateCredentials,
  validateSignUp,
  type CredentialRejection,
} from '../../../src/auth/credentials';
import type { Account, AuthSession } from '../../../src/auth/types';
import { JsonFile } from '../db/JsonFile';

interface AccountRecord extends Account {
  readonly salt: string;
  readonly passwordHash: string;
}

interface SessionRecord {
  readonly token: string;
  readonly accountId: string;
  readonly createdAt: number;
}

export interface AccountsFile {
  accounts: AccountRecord[];
  sessions: SessionRecord[];
}

const EMPTY: AccountsFile = { accounts: [], sessions: [] };

/** A token is good for a month; after that the login screen comes back. */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const KEY_BYTES = 64;

export type AccountResult =
  | { readonly ok: true; readonly session: AuthSession }
  | { readonly ok: false; readonly reason: CredentialRejection };

const publicAccount = ({ id, displayName, email, createdAt }: AccountRecord): Account => ({
  id,
  displayName,
  email,
  createdAt,
});

/**
 * Accounts and their sessions, kept in the deployment's own database rather
 * than at an identity provider: a self-hosted Collab has a directory of names
 * without anybody having to create a Google or a Facebook account first, and
 * that directory is what the calendar invites people from.
 *
 * Passwords are stored as scrypt hashes with a per-account salt. Nothing here
 * ever hands back the hash, and a wrong password is indistinguishable from an
 * email that has no account.
 */
export class AccountStore {
  private readonly data: AccountsFile;

  constructor(
    private readonly file: JsonFile<AccountsFile> = new JsonFile(null, EMPTY),
    private readonly now: () => number = Date.now,
  ) {
    const loaded = this.file.read();
    this.data = { accounts: loaded.accounts ?? [], sessions: loaded.sessions ?? [] };
  }

  signUp(input: unknown): AccountResult {
    const validated = validateSignUp(input);
    if (!validated.ok) {
      return validated;
    }
    const { displayName, email, password } = validated.value;
    if (this.data.accounts.some((account) => account.email === email)) {
      return { ok: false, reason: 'email-taken' };
    }
    const salt = randomBytes(16).toString('hex');
    const record: AccountRecord = {
      id: randomUUID(),
      displayName,
      email,
      createdAt: this.now(),
      salt,
      passwordHash: scryptSync(password, salt, KEY_BYTES).toString('hex'),
    };
    this.data.accounts.push(record);
    return { ok: true, session: this.openSession(record) };
  }

  logIn(input: unknown): AccountResult {
    const validated = validateCredentials(input);
    if (!validated.ok) {
      return validated;
    }
    const { email, password } = validated.value;
    const record = this.data.accounts.find((account) => account.email === email);
    if (!record || !this.passwordMatches(record, password)) {
      return { ok: false, reason: 'wrong-credentials' };
    }
    return { ok: true, session: this.openSession(record) };
  }

  logOut(token: string): void {
    const remaining = this.data.sessions.filter((session) => session.token !== token);
    if (remaining.length !== this.data.sessions.length) {
      this.data.sessions = remaining;
      this.persist();
    }
  }

  /** The account a bearer token belongs to, or null when it is stale or unknown. */
  accountForToken(token: string): Account | null {
    const session = this.data.sessions.find((entry) => entry.token === token);
    if (!session) {
      return null;
    }
    if (this.now() - session.createdAt > SESSION_TTL_MS) {
      this.logOut(token);
      return null;
    }
    const record = this.data.accounts.find((account) => account.id === session.accountId);
    return record ? publicAccount(record) : null;
  }

  /** Everyone with an account, so a meeting can be scheduled with them by name. */
  directory(): Account[] {
    return this.data.accounts
      .map(publicAccount)
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  get(id: string): Account | null {
    const record = this.data.accounts.find((account) => account.id === id);
    return record ? publicAccount(record) : null;
  }

  private passwordMatches(record: AccountRecord, password: string): boolean {
    const expected = Buffer.from(record.passwordHash, 'hex');
    const actual = scryptSync(password, record.salt, expected.byteLength || KEY_BYTES);
    return expected.byteLength === actual.byteLength && timingSafeEqual(expected, actual);
  }

  private openSession(account: AccountRecord): AuthSession {
    const token = randomBytes(32).toString('base64url');
    this.data.sessions = [
      ...this.data.sessions.filter((entry) => this.now() - entry.createdAt <= SESSION_TTL_MS),
      { token, accountId: account.id, createdAt: this.now() },
    ];
    this.persist();
    return { token, account: publicAccount(account) };
  }

  private persist(): void {
    this.file.write(this.data);
  }
}

/** `null` for the path keeps the accounts in memory for the lifetime of the process. */
export function createAccountStore(path: string | null): AccountStore {
  return new AccountStore(new JsonFile<AccountsFile>(path, { accounts: [], sessions: [] }));
}
