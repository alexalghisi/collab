import { execFileSync } from 'node:child_process';
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
  // Wandbox stand-in: runs the Python the page sends, on this machine, and answers
  // in Wandbox's shape. Real pass/fail, no network.
  await page.route('https://wandbox.org/api/compile.json', async (route) => {
    const body = route.request().postDataJSON() as { code: string; stdin: string };
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

test('host picks a problem, guest follows; load into editor; run on examples', async ({
  browser,
}) => {
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
  await host.getByRole('button', { name: 'Probleme', exact: true }).click();
  await expect(host.getByText('Sharing with the room')).toBeVisible();
  await host.getByRole('button', { name: 'Suma cifrelor (OLI 5)' }).click();
  await expect(host.getByText('Example 1')).toBeVisible();

  // Guest sees the same problem without touching anything but the panel button.
  const guestPanel = guest.getByRole('button', { name: 'Probleme', exact: true });
  if (!(await guest.getByText('Following the host').isVisible())) {
    await guestPanel.click();
  }
  await expect(guest.getByText('Following the host')).toBeVisible();
  await expect(guest.getByRole('heading', { name: 'Suma cifrelor (OLI 5)' })).toBeVisible();
  await expect(guest.getByText('Example 1')).toBeVisible();

  // Host changes problem with the keyboard; the guest follows.
  await host.keyboard.press('Alt+ArrowRight');
  await expect(host.getByRole('heading', { name: 'Este palindrom? (OLI 5)' })).toBeVisible();
  await expect(guest.getByRole('heading', { name: 'Este palindrom? (OLI 5)' })).toBeVisible();

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
  await expect(host.getByText('3/3 examples passed')).toBeVisible();

  // A wrong answer fails and shows what it printed.
  await setEditorText(host, SUMA_CIFRELOR.replace('sum(int(c)', '1 + sum(int(c)'));
  await host.getByRole('button', { name: 'Run on examples' }).click();
  await expect(host.getByText('0/3 examples passed')).toBeVisible();
  await expect(host.getByText(/Your output/).first()).toBeVisible();

  // The guest browses freely without moving the host.
  await guest.getByRole('switch', { name: 'Stop following the host' }).click();
  await expect(guest.getByText('Browsing freely')).toBeVisible();
  await guest.getByRole('button', { name: 'Back to list' }).click();
  await guest.getByRole('button', { name: 'Este palindrom? (OLI 5)' }).click();
  await expect(guest.getByRole('heading', { name: 'Este palindrom? (OLI 5)' })).toBeVisible();
  await expect(host.getByRole('heading', { name: 'Suma cifrelor (OLI 5)' })).toBeVisible();
  await expect(host.getByText('Sharing with the room')).toBeVisible();

  // A refresh keeps the shared problem.
  await host.reload();
  await expect(host.getByText(roomId).first()).toBeVisible();
  if (!(await host.getByText('Sharing with the room').isVisible())) {
    await host.getByRole('button', { name: 'Probleme', exact: true }).click();
  }
  await expect(host.getByRole('heading', { name: 'Suma cifrelor (OLI 5)' })).toBeVisible();

  expect(errorsOf(host)).toEqual([]);
  expect(errorsOf(guest)).toEqual([]);
});
