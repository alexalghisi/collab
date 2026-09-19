import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  UserStore,
  createUserStoreFromEnv,
  gistUserStore,
  httpUserStore,
  openUserFile,
  sealUserFile,
} from './store';

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'collab-users-'));
  dirs.push(dir);
  return dir;
}

describe('UserStore', () => {
  it('remembers a sign-up on disk so a new process can sign that person in', () => {
    const path = join(tempDir(), 'users.json');
    const first = new UserStore(path);
    first.create({
      email: 'Ada@Example.com',
      displayName: 'Ada',
      passwordHash: 'salt:hash',
    });

    const second = new UserStore(path);
    const found = second.findByEmail('ada@example.com');
    expect(found?.displayName).toBe('Ada');
    expect(found?.passwordHash).toBe('salt:hash');
  });

  it('keeps local accounts and uploads them when the cloud copy is empty', async () => {
    const path = join(tempDir(), 'users.json');
    const first = new UserStore(path);
    first.create({ email: 'ada@example.com', displayName: 'Ada', passwordHash: 'x' });
    const pushed: unknown[] = [];
    const store = new UserStore(path, {
      async pull() {
        return { users: [] };
      },
      async push(file) {
        pushed.push(file);
      },
    });

    await store.ready();

    expect(store.findByEmail('ada@example.com')?.displayName).toBe('Ada');
    expect(pushed).toHaveLength(1);
  });

  it('hydrates from the cloud copy when the local file is empty', async () => {
    const path = join(tempDir(), 'users.json');
    const remote = {
      file: {
        users: [
          {
            uid: 'u1',
            email: 'linus@example.com',
            displayName: 'Linus',
            passwordHash: 'salt:hash',
            googleSub: null,
          },
        ],
      },
      async pull() {
        return this.file;
      },
      async push() {},
    };
    const store = new UserStore(path, remote);
    expect(store.findByEmail('linus@example.com')).toBeUndefined();

    await store.ready();

    expect(store.findByEmail('linus@example.com')?.displayName).toBe('Linus');
    expect(JSON.parse(readFileSync(path, 'utf8')).users[0].email).toBe('linus@example.com');
  });

  it('pushes a new account to the cloud store', async () => {
    const path = join(tempDir(), 'users.json');
    const pushed: unknown[] = [];
    const store = new UserStore(path, {
      async pull() {
        return null;
      },
      async push(file) {
        pushed.push(file);
      },
    });
    store.create({ email: 'ada@example.com', displayName: 'Ada', passwordHash: 'x' });
    await Promise.resolve();

    expect(pushed).toHaveLength(1);
    expect((pushed[0] as { users: Array<{ email: string }> }).users[0].email).toBe(
      'ada@example.com',
    );
  });
});

describe('sealed user file', () => {
  it('round-trips and refuses the wrong secret', () => {
    const file = {
      users: [
        {
          uid: 'u1',
          email: 'ada@example.com',
          displayName: 'Ada',
          passwordHash: 'x',
          googleSub: null,
        },
      ],
    };
    const sealed = sealUserFile(file, 'right-secret');
    expect(openUserFile(sealed, 'right-secret')).toEqual(file);
    expect(openUserFile(sealed, 'wrong-secret')).toBeNull();
  });

  it('still reads a plain users array from an older store', () => {
    const file = { users: [] };
    expect(openUserFile(JSON.stringify(file), 'any')).toEqual(file);
  });
});

describe('httpUserStore', () => {
  it('PUTs a sealed body and GETs it back', async () => {
    let stored = '';
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
      if ((init?.method ?? 'GET') === 'PUT') {
        stored = String(init?.body);
        return new Response('ok', { status: 200 });
      }
      return new Response(stored, { status: stored ? 200 : 404 });
    }) as unknown as typeof fetch;
    const remote = httpUserStore('https://store.example/users', 'secret', fetchImpl);
    await remote.push({
      users: [
        {
          uid: 'u1',
          email: 'ada@example.com',
          displayName: 'Ada',
          passwordHash: 'x',
          googleSub: null,
        },
      ],
    });
    const pulled = await remote.pull();
    expect(pulled?.users[0]?.email).toBe('ada@example.com');
    expect(stored).toContain('"v":1');
  });
});

describe('gistUserStore', () => {
  it('reads and writes the first file on the gist', async () => {
    let content = '';
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
      if (init?.method === 'PATCH') {
        const body = JSON.parse(String(init.body)) as {
          files: { 'collab-users.json': { content: string } };
        };
        content = body.files['collab-users.json'].content;
        return new Response('{}', { status: 200 });
      }
      return new Response(JSON.stringify({ files: { 'collab-users.json': { content } } }), {
        status: content ? 200 : 404,
      });
    }) as unknown as typeof fetch;
    const remote = gistUserStore('gist1', 'token', 'secret', fetchImpl);
    await remote.push({
      users: [
        {
          uid: 'u1',
          email: 'ada@example.com',
          displayName: 'Ada',
          passwordHash: 'x',
          googleSub: null,
        },
      ],
    });
    expect(await remote.pull()).toEqual({
      users: [
        {
          uid: 'u1',
          email: 'ada@example.com',
          displayName: 'Ada',
          passwordHash: 'x',
          googleSub: null,
        },
      ],
    });
  });
});

describe('createUserStoreFromEnv', () => {
  it('stays on the local file when no cloud URL is set', () => {
    const path = join(tempDir(), 'users.json');
    writeFileSync(path, '{"users":[]}');
    const store = createUserStoreFromEnv(path, {});
    expect(store.findByEmail('nobody@example.com')).toBeUndefined();
  });
});
