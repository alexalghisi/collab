import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AccountError, AccountStore, fileDatabase, memoryDatabase } from './AccountStore';

const ada = { name: 'Ada Lovelace', email: 'Ada@Example.com', password: 'analytical-engine' };

describe('AccountStore', () => {
  const directories: string[] = [];

  const onDisk = () => {
    const directory = mkdtempSync(join(tmpdir(), 'collab-accounts-'));
    directories.push(directory);
    const path = join(directory, 'accounts.json');
    return { path, store: new AccountStore(fileDatabase(path)) };
  };

  afterEach(() => {
    for (const directory of directories.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('signs a new person up and recognises their token', () => {
    const store = new AccountStore(memoryDatabase());

    const session = store.signUp(ada);

    expect(session.account).toMatchObject({ name: 'Ada Lovelace', email: 'ada@example.com' });
    expect(store.accountFor(session.token)).toEqual(session.account);
  });

  it('refuses a second account on the same address, whatever its case', () => {
    const store = new AccountStore(memoryDatabase());
    store.signUp(ada);

    expect(() => store.signUp({ ...ada, email: 'ADA@example.com' })).toThrow(AccountError);
  });

  it('rejects a name, an address or a password it cannot use', () => {
    const store = new AccountStore(memoryDatabase());

    expect(() => store.signUp({ ...ada, name: '  ' })).toThrow(/name/i);
    expect(() => store.signUp({ ...ada, email: 'ada@' })).toThrow(/email/i);
    expect(() => store.signUp({ ...ada, password: 'short' })).toThrow(/password/i);
  });

  it('signs in with the right password and turns away the wrong one', () => {
    const store = new AccountStore(memoryDatabase());
    store.signUp(ada);

    expect(store.signIn({ email: 'ada@example.com', password: ada.password }).account.name).toBe(
      'Ada Lovelace',
    );
    expect(() => store.signIn({ email: 'ada@example.com', password: 'guess' })).toThrow(
      /do not match/i,
    );
  });

  it('answers the same way for an unknown address as for a wrong password', () => {
    const store = new AccountStore(memoryDatabase());
    store.signUp(ada);

    const unknown = store.signIn.bind(store, { email: 'nobody@example.com', password: 'whatever' });
    const wrong = store.signIn.bind(store, { email: 'ada@example.com', password: 'whatever' });

    expect(unknown).toThrow('That email and password do not match an account.');
    expect(wrong).toThrow('That email and password do not match an account.');
  });

  it('forgets a token once it is signed out', () => {
    const store = new AccountStore(memoryDatabase());
    const { token } = store.signUp(ada);

    store.signOut(token);

    expect(store.accountFor(token)).toBeNull();
  });

  it('lists everyone by name for the invitee directory', () => {
    const store = new AccountStore(memoryDatabase());
    store.signUp({ name: 'Linus', email: 'linus@example.com', password: 'kernel-panic' });
    store.signUp(ada);

    expect(store.directory().map((person) => person.name)).toEqual(['Ada Lovelace', 'Linus']);
  });

  it('keeps the accounts across a restart and never writes the password itself', () => {
    const { path, store } = onDisk();
    const { token } = store.signUp(ada);

    const reopened = new AccountStore(fileDatabase(path));

    expect(reopened.accountFor(token)).toMatchObject({ email: 'ada@example.com' });
    expect(readFileSync(path, 'utf8')).not.toContain(ada.password);
  });
});
