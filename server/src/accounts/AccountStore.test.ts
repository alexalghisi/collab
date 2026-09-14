import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { JsonFile } from '../db/JsonFile';
import { AccountStore, SESSION_TTL_MS, type AccountsFile } from './AccountStore';

const ada = { displayName: 'Ada Lovelace', email: 'Ada@Example.com', password: 'analytical-1' };

const inMemory = (now?: () => number) =>
  new AccountStore(new JsonFile<AccountsFile>(null, { accounts: [], sessions: [] }), now);

const onDisk = (path: string, now?: () => number) =>
  new AccountStore(new JsonFile<AccountsFile>(path, { accounts: [], sessions: [] }), now);

describe('signing up', () => {
  it('creates the account, lowercases the email and opens a session', () => {
    const store = inMemory();

    const result = store.signUp(ada);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.session.account).toMatchObject({
      displayName: 'Ada Lovelace',
      email: 'ada@example.com',
    });
    expect(result.session.token).not.toBe('');
    expect(store.accountForToken(result.session.token)?.id).toBe(result.session.account.id);
  });

  it('refuses a second account on the same email', () => {
    const store = inMemory();
    store.signUp(ada);

    const again = store.signUp({ ...ada, email: 'ada@example.com', displayName: 'Impostor' });

    expect(again).toEqual({ ok: false, reason: 'email-taken' });
  });

  it('refuses a blank name, a malformed email and a short password', () => {
    const store = inMemory();

    expect(store.signUp({ ...ada, displayName: '  ' })).toEqual({
      ok: false,
      reason: 'name-required',
    });
    expect(store.signUp({ ...ada, email: 'ada@' })).toEqual({
      ok: false,
      reason: 'email-invalid',
    });
    expect(store.signUp({ ...ada, password: 'short' })).toEqual({
      ok: false,
      reason: 'password-short',
    });
  });
});

describe('signing in', () => {
  it('accepts the password whatever case the email was typed in', () => {
    const store = inMemory();
    store.signUp(ada);

    const result = store.logIn({ email: 'ADA@example.com', password: ada.password });

    expect(result.ok).toBe(true);
  });

  it('says the same thing for a wrong password as for an unknown email', () => {
    const store = inMemory();
    store.signUp(ada);

    expect(store.logIn({ email: ada.email, password: 'not-the-one' })).toEqual({
      ok: false,
      reason: 'wrong-credentials',
    });
    expect(store.logIn({ email: 'nobody@example.com', password: ada.password })).toEqual({
      ok: false,
      reason: 'wrong-credentials',
    });
  });
});

describe('sessions', () => {
  it('forgets a token once it is signed out', () => {
    const store = inMemory();
    const result = store.signUp(ada);
    if (!result.ok) throw new Error('sign-up failed');

    store.logOut(result.session.token);

    expect(store.accountForToken(result.session.token)).toBeNull();
  });

  it('lets a token expire', () => {
    let clock = 1_000;
    const store = inMemory(() => clock);
    const result = store.signUp(ada);
    if (!result.ok) throw new Error('sign-up failed');

    clock += SESSION_TTL_MS + 1;

    expect(store.accountForToken(result.session.token)).toBeNull();
  });

  it('rejects a token nobody was given', () => {
    expect(inMemory().accountForToken('made-up')).toBeNull();
  });
});

describe('the directory', () => {
  it('lists everyone by name, without a password anywhere in sight', () => {
    const store = inMemory();
    store.signUp(ada);
    store.signUp({ displayName: 'Linus', email: 'linus@example.com', password: 'kernel-panic' });

    const directory = store.directory();

    expect(directory.map((account) => account.displayName)).toEqual(['Ada Lovelace', 'Linus']);
    expect(JSON.stringify(directory)).not.toContain('analytical-1');
  });
});

describe('the database file', () => {
  it('keeps accounts across restarts and never writes a plain password', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'collab-accounts-')), 'accounts.json');
    const first = onDisk(path);
    const result = first.signUp(ada);
    if (!result.ok) throw new Error('sign-up failed');

    const restarted = onDisk(path);

    expect(restarted.accountForToken(result.session.token)?.email).toBe('ada@example.com');
    expect(restarted.logIn({ email: ada.email, password: ada.password }).ok).toBe(true);
    expect(readFileSync(path, 'utf8')).not.toContain(ada.password);
  });
});
