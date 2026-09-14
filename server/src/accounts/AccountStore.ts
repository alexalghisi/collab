import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { looksLikeEmail, MIN_PASSWORD_LENGTH, normalizeEmail } from '../../../src/auth/credentials';

/** An account as everybody else in the deployment may see it. */
export interface Account {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly createdAt: number;
}

export interface Credentials {
  readonly email: string;
  readonly password: string;
}

export interface SignUpRequest extends Credentials {
  readonly name: string;
}

export interface Session {
  readonly account: Account;
  /** Bearer token the client keeps; only its hash is stored. */
  readonly token: string;
}

/** Rejection the router can turn straight into a status and a message. */
export class AccountError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'AccountError';
  }
}

interface AccountRecord extends Account {
  readonly passwordHash: string;
  readonly passwordSalt: string;
}

interface SessionRecord {
  readonly tokenHash: string;
  readonly accountId: string;
  readonly createdAt: number;
}

interface Snapshot {
  accounts: AccountRecord[];
  sessions: SessionRecord[];
}

/** Where a store keeps its snapshot, so tests can run without a disk. */
export interface AccountDatabase {
  read(): Snapshot | null;
  write(snapshot: Snapshot): void;
}

const KEY_LENGTH = 64;

function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, KEY_LENGTH).toString('hex');
}

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/** Constant-time compare, so a wrong password costs the same whatever it is. */
function samePassword(record: AccountRecord, password: string): boolean {
  const attempt = Buffer.from(hashPassword(password, record.passwordSalt), 'hex');
  const stored = Buffer.from(record.passwordHash, 'hex');
  return attempt.length === stored.length && timingSafeEqual(attempt, stored);
}

const publicAccount = ({ id, name, email, createdAt }: AccountRecord): Account => ({
  id,
  name,
  email,
  createdAt,
});

/**
 * The deployment's own list of people: names, email addresses, password
 * verifiers and the sessions handed out for them. It is deliberately a local
 * database rather than a hosted identity provider — signing up needs nothing
 * but the signaling server, and the directory it builds is what the calendar
 * offers as invitees.
 */
export class AccountStore {
  private readonly snapshot: Snapshot;

  constructor(private readonly database: AccountDatabase) {
    this.snapshot = database.read() ?? { accounts: [], sessions: [] };
  }

  signUp({ name, email, password }: SignUpRequest): Session {
    const displayName = name.trim();
    const address = normalizeEmail(email);
    if (displayName === '') {
      throw new AccountError(400, 'Enter your name.');
    }
    if (!looksLikeEmail(address)) {
      throw new AccountError(400, 'Enter a valid email address.');
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new AccountError(400, `Use a password of at least ${MIN_PASSWORD_LENGTH} characters.`);
    }
    if (this.find(address)) {
      throw new AccountError(409, 'That email address already has an account.');
    }

    const passwordSalt = randomBytes(16).toString('hex');
    const record: AccountRecord = {
      id: randomUUID(),
      name: displayName,
      email: address,
      createdAt: Date.now(),
      passwordSalt,
      passwordHash: hashPassword(password, passwordSalt),
    };
    this.snapshot.accounts.push(record);
    return this.openSession(record);
  }

  signIn({ email, password }: Credentials): Session {
    const record = this.find(normalizeEmail(email));
    // One message for both halves: which of the two was wrong is not the
    // caller's business, and saying so enumerates the accounts.
    if (!record || !samePassword(record, password)) {
      throw new AccountError(401, 'That email and password do not match an account.');
    }
    return this.openSession(record);
  }

  /** The account a bearer token belongs to, or null when it is unknown. */
  accountFor(token: string): Account | null {
    const session = this.snapshot.sessions.find((entry) => entry.tokenHash === hashToken(token));
    const record =
      session && this.snapshot.accounts.find((entry) => entry.id === session.accountId);
    return record ? publicAccount(record) : null;
  }

  signOut(token: string): void {
    const tokenHash = hashToken(token);
    const index = this.snapshot.sessions.findIndex((entry) => entry.tokenHash === tokenHash);
    if (index >= 0) {
      this.snapshot.sessions.splice(index, 1);
      this.persist();
    }
  }

  /** Everyone with an account here, by name — the invitee list for scheduling. */
  directory(): Account[] {
    return this.snapshot.accounts.map(publicAccount).sort((a, b) => a.name.localeCompare(b.name));
  }

  private find(email: string): AccountRecord | undefined {
    return this.snapshot.accounts.find((entry) => entry.email === email);
  }

  private openSession(record: AccountRecord): Session {
    const token = randomBytes(32).toString('base64url');
    this.snapshot.sessions.push({
      tokenHash: hashToken(token),
      accountId: record.id,
      createdAt: Date.now(),
    });
    this.persist();
    return { account: publicAccount(record), token };
  }

  private persist(): void {
    this.database.write(this.snapshot);
  }
}

/** Snapshot on disk, replaced by rename so a crash cannot leave half a file. */
export function fileDatabase(path: string): AccountDatabase {
  return {
    read() {
      if (!existsSync(path)) {
        return null;
      }
      return JSON.parse(readFileSync(path, 'utf8')) as Snapshot;
    },
    write(snapshot) {
      mkdirSync(dirname(path), { recursive: true });
      const staging = `${path}.tmp`;
      writeFileSync(staging, `${JSON.stringify(snapshot, null, 2)}\n`, { mode: 0o600 });
      renameSync(staging, path);
    },
  };
}

export function memoryDatabase(): AccountDatabase {
  let held: Snapshot | null = null;
  return {
    read: () => held,
    write(snapshot) {
      held = JSON.parse(JSON.stringify(snapshot)) as Snapshot;
    },
  };
}

export function defaultAccountsPath(): string {
  const configured = process.env.ACCOUNTS_DB_PATH?.trim();
  if (configured) {
    return configured;
  }
  return join(dirname(fileURLToPath(import.meta.url)), '../../data/accounts.json');
}

export function openAccountStore(path = defaultAccountsPath()): AccountStore {
  return new AccountStore(fileDatabase(path));
}
