import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Browser, type Page } from '@playwright/test';

const SIGNALING = 'http://localhost:4000';

/** A signed-in browser: registers on the local server and plants the session token. */
async function signedIn(browser: Browser, name: string): Promise<Page> {
  const response = await fetch(`${SIGNALING}/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      displayName: name,
      email: `${name.toLowerCase()}-${Date.now()}@e2e.test`,
      password: 'e2e-password-1',
    }),
  });
  const { token } = (await response.json()) as { token: string };
  const context = await browser.newContext();
  await context.addInitScript((value) => {
    localStorage.setItem('collab.auth.token', value);
  }, token);
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  (page as Page & { errors: string[] }).errors = errors;
  // Wandbox stand-in: runs the Python or C++ the page sends, on this machine, and
  // answers in Wandbox's shape. Real pass/fail, no network.
  const compiles: string[] = [];
  (page as Page & { compiles: string[] }).compiles = compiles;
  await page.route('https://wandbox.org/api/compile.json', async (route) => {
    const body = route.request().postDataJSON() as {
      compiler: string;
      code: string;
      stdin: string;
    };
    compiles.push(body.compiler);
    if (body.compiler.startsWith('gcc')) {
      await route.fulfill({ json: runCpp(body.code, body.stdin) });
      return;
    }
    let output: string;
    let status = '0';
    try {
      output = execFileSync('python3', ['-c', body.code], {
        input: body.stdin,
        timeout: 10_000,
      }).toString();
    } catch (error) {
      status = '1';
      output = String((error as { stdout?: Buffer }).stdout ?? '');
    }
    await route.fulfill({ json: { status, program_output: output } });
  });
  return page;
}

/** g++ on this machine, answering the way Wandbox does for a build that fails or runs. */
function runCpp(code: string, stdin: string): Record<string, string> {
  const dir = mkdtempSync(join(tmpdir(), 'collab-e2e-'));
  writeFileSync(join(dir, 'prog.cc'), code);
  const build = spawnSync('g++', ['prog.cc', '-o', 'prog'], { cwd: dir, encoding: 'utf8' });
  if (build.status !== 0) {
    return { status: '1', compiler_error: build.stderr, program_output: '' };
  }
  const run = spawnSync(join(dir, 'prog'), [], {
    cwd: dir,
    encoding: 'utf8',
    input: stdin,
    timeout: 20_000,
  });
  return {
    status: String(run.status ?? ''),
    compiler_error: build.stderr,
    program_output: run.stdout,
    program_error: run.stderr,
  };
}

function compilesOf(page: Page): string[] {
  return (page as Page & { compiles: string[] }).compiles;
}

function errorsOf(page: Page): string[] {
  return (page as Page & { errors: string[] }).errors;
}

async function editorText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const api = (
      window as unknown as { monaco?: { editor: { getModels(): { getValue(): string }[] } } }
    ).monaco;
    return api?.editor.getModels()[0]?.getValue() ?? '';
  });
}

async function setEditorText(page: Page, text: string): Promise<void> {
  await page.evaluate((value) => {
    const api = (
      window as unknown as {
        monaco: { editor: { getModels(): { setValue(v: string): void }[] } };
      }
    ).monaco;
    api.editor.getModels()[0]?.setValue(value);
  }, text);
}

const SUMA_CIFRELOR = `import sys
def suma(n):
    return sum(int(c) for c in str(n))
data = sys.stdin.read().split()
n = int(data[0])
print("\\n".join(str(suma(int(x))) for x in data[1:1 + n]))
`;

const SUMA_CIFRELOR_CPP = `#include <iostream>
using namespace std;
int suma(long long n) {
  int total = 0;
  for (; n > 0; n /= 10) total += n % 10;
  return total;
}
int main() {
  int n;
  cin >> n;
  while (n--) {
    long long x;
    cin >> x;
    cout << suma(x) << "\\n";
  }
}
`;

test('a C++ solution is compiled once for all of its examples', async ({ browser }) => {
  const host = await signedIn(browser, 'Host');
  await host.goto('/');
  await host.getByText('New meeting').first().click();
  await host.waitForURL(/room=/);
  await host.getByRole('button', { name: 'Problems', exact: true }).click();
  await host.getByRole('button', { name: 'Suma cifrelor (OLI 5)' }).click();
  await expect(host.getByText('Example 3')).toBeVisible();
  await host.getByRole('button', { name: 'Load into editor' }).click();
  await expect.poll(() => editorText(host)).toContain('int main()');

  // Three examples, one trip to the compiler.
  await setEditorText(host, SUMA_CIFRELOR_CPP);
  await host.getByRole('button', { name: 'Run on examples' }).click();
  await expect(host.getByText(/3\/3 examples passed/)).toBeVisible();
  expect(compilesOf(host)).toEqual(['gcc-13.2.0']);

  // A wrong answer still shows what each example printed.
  await setEditorText(host, SUMA_CIFRELOR_CPP.replace('int total = 0;', 'int total = 1;'));
  await host.getByRole('button', { name: 'Run on examples' }).click();
  await expect(host.getByText(/0\/3 examples passed/)).toBeVisible();
  await expect(host.getByText(/Your output/)).toHaveCount(3);
  expect(compilesOf(host)).toHaveLength(2);

  // A program that does not build says so, with the line, instead of an empty output.
  await setEditorText(host, SUMA_CIFRELOR_CPP.replace('cin >> n;', 'cin >> m;'));
  await host.getByRole('button', { name: 'Run on examples' }).click();
  await expect(host.getByText(/Does not compile \(line 10: /)).toHaveCount(3);
  expect(compilesOf(host)).toHaveLength(3);

  expect(errorsOf(host)).toEqual([]);
});

test('both participants always see the same problem and example verdicts', async ({ browser }) => {
  // Two browsers walking both directions of the sync take longer than the default.
  test.setTimeout(240_000);
  const host = await signedIn(browser, 'Host');
  await host.goto('/');
  await host.getByText('New meeting').first().click();
  await host.waitForURL(/room=/);
  const roomId = new URL(host.url()).searchParams.get('room') ?? '';
  expect(roomId).not.toBe('');

  const guest = await signedIn(browser, 'Guest');
  await guest.goto('/');
  await guest.getByPlaceholder('Meeting ID from an invite').fill(roomId);
  await guest.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(guest.getByText(roomId).first()).toBeVisible();

  // Host opens the panel and picks a problem.
  await host.getByRole('button', { name: 'Problems', exact: true }).click();
  await expect(host.getByText('Synced · you are the host')).toBeVisible();
  await host.getByRole('button', { name: 'Suma cifrelor (OLI 5)' }).click();
  await expect(host.getByText('Example 1')).toBeVisible();

  // Guest sees the same problem without touching anything but the panel button.
  const guestPanel = guest.getByRole('button', { name: 'Problems', exact: true });
  if (!(await guest.getByText('Synced with the room').isVisible())) {
    await guestPanel.click();
  }
  await expect(guest.getByText('Synced with the room')).toBeVisible();
  await expect(guest.getByRole('heading', { name: 'Suma cifrelor (OLI 5)' })).toBeVisible();
  await expect(guest.getByText('Example 1')).toBeVisible();

  // Host changes problem with the keyboard; the guest follows.
  await host.keyboard.press('Alt+ArrowLeft');
  await expect(host.getByRole('heading', { name: 'Produsul cifrelor (OLI 5)' })).toBeVisible();
  await expect(guest.getByRole('heading', { name: 'Produsul cifrelor (OLI 5)' })).toBeVisible();

  // Back to "Suma cifrelor" through the list, then load a Python starter.
  await host.getByRole('button', { name: 'Back to list' }).click();
  await host.getByRole('button', { name: 'Suma cifrelor (OLI 5)' }).click();
  await expect(guest.getByText('Example 1')).toBeVisible();
  await host.getByRole('button', { name: 'Switch to Python' }).click();
  await host.getByRole('button', { name: 'Load into editor' }).click();
  await expect.poll(() => editorText(host)).toContain('# Suma cifrelor (OLI 5)');
  await expect.poll(() => editorText(guest)).toContain('# Suma cifrelor (OLI 5)');

  // Existing code is not overwritten without asking.
  await setEditorText(host, SUMA_CIFRELOR);
  await host.getByRole('button', { name: 'Load into editor' }).click();
  await expect(host.getByText('Replace the code in the editor with this starter?')).toBeVisible();
  await host.getByRole('button', { name: 'Keep' }).click();
  await expect.poll(() => editorText(guest)).toContain('def suma(n)');

  // Run on examples: the solution passes every example.
  await host.getByRole('button', { name: 'Run on examples' }).click();
  await expect(host.getByText(/3\/3 examples passed/)).toBeVisible();
  // The guest sees the same verdicts, and who ran them, without pressing anything.
  await expect(guest.getByText('3/3 examples passed · run by Host')).toBeVisible();

  // A wrong answer fails and shows what it printed.
  await setEditorText(host, SUMA_CIFRELOR.replace('sum(int(c)', '1 + sum(int(c)'));
  await host.getByRole('button', { name: 'Run on examples' }).click();
  await expect(host.getByText(/0\/3 examples passed/)).toBeVisible();
  await expect(host.getByText(/Your output/).first()).toBeVisible();
  await expect(guest.getByText(/0\/3 examples passed/)).toBeVisible();
  await expect(guest.getByText(/Your output/).first()).toBeVisible();

  // A guest who opens a problem moves the whole room, and their run shows to the host.
  await expect(guest.getByRole('switch')).toHaveCount(0);
  await guest.getByRole('button', { name: 'Back to list' }).click();
  await guest.getByRole('button', { name: 'Suma cifrelor (OLI 5)' }).click();
  await expect(host.getByRole('heading', { name: 'Suma cifrelor (OLI 5)' })).toBeVisible();
  await setEditorText(guest, SUMA_CIFRELOR);
  await expect.poll(() => editorText(host)).toContain('def suma(n)');
  await guest.getByRole('button', { name: 'Run on examples' }).click();
  await expect(guest.getByText(/3\/3 examples passed/)).toBeVisible();
  await expect(host.getByText('3/3 examples passed · run by Guest')).toBeVisible();

  // Submit opens collaborare.ro with the shared code in the link, ready to submit there.
  await host
    .context()
    .route('https://collaborare.ro/**', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<title>collaborare</title>' }),
    );
  const [site] = await Promise.all([
    host.context().waitForEvent('page'),
    host.getByRole('button', { name: 'Submit on collaborare.ro' }).click(),
  ]);
  const opened = new URL(site.url());
  expect(opened.pathname).toMatch(/^\/probleme\//);
  const handoff = new URLSearchParams(opened.hash.slice(1)).get('collab') ?? '';
  const payload = JSON.parse(
    Buffer.from(handoff.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'),
  ) as { lang: string; code: string; submit: boolean };
  expect(payload).toMatchObject({ lang: 'python', submit: true });
  expect(payload.code).toContain('def suma(n)');
  await expect(host.getByText(/Sent to collaborare.ro/)).toBeVisible();
  await site.close();

  // Even a hidden panel comes back when the other person opens a problem.
  await host.getByRole('button', { name: 'Hide problems' }).click();
  await guest.getByRole('button', { name: 'Back to list' }).click();
  await guest.getByRole('button', { name: 'Este palindrom? (OLI 5)' }).click();
  await expect(host.getByRole('heading', { name: 'Este palindrom? (OLI 5)' })).toBeVisible();
  await expect(host.getByText(/examples passed/)).toHaveCount(0);
  await guest.getByRole('button', { name: 'Back to list' }).click();
  await guest.getByRole('button', { name: 'Suma cifrelor (OLI 5)' }).click();
  await expect(host.getByRole('heading', { name: 'Suma cifrelor (OLI 5)' })).toBeVisible();

  // A refresh keeps the shared problem.
  await host.reload();
  await expect(host.getByText(roomId).first()).toBeVisible();
  if (!(await host.getByText('Synced · you are the host').isVisible())) {
    await host.getByRole('button', { name: 'Problems', exact: true }).click();
  }
  await expect(host.getByRole('heading', { name: 'Suma cifrelor (OLI 5)' })).toBeVisible();

  expect(errorsOf(host)).toEqual([]);
  expect(errorsOf(guest)).toEqual([]);
});
