import { expect, test, type Browser, type Page } from '@playwright/test';

const SIGNALING = 'http://localhost:4000';

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
    const tones = { count: 0 };
    (window as unknown as { chatTones: { count: number } }).chatTones = tones;
    const start = OscillatorNode.prototype.start;
    OscillatorNode.prototype.start = function patched(this: OscillatorNode, when?: number) {
      tones.count += 1;
      return start.call(this, when);
    };
  }, token);
  return context.newPage();
}

async function editorText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const api = (
      window as unknown as { monaco?: { editor: { getModels(): { getValue(): string }[] } } }
    ).monaco;
    return api?.editor.getModels()[0]?.getValue() ?? '';
  });
}

test('a chat message keeps its lines, rings for the other person and reads well', async ({
  browser,
}) => {
  const host = await signedIn(browser, 'Host');
  await host.goto('/');
  await host.getByText('New meeting').first().click();
  await host.waitForURL(/room=/);
  const roomId = new URL(host.url()).searchParams.get('room') ?? '';

  const guest = await signedIn(browser, 'Guest');
  await guest.goto('/');
  await guest.getByPlaceholder('Meeting ID from an invite').fill(roomId);
  await guest.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(guest.getByText(roomId).first()).toBeVisible();

  await host.getByRole('button', { name: 'Chat', exact: true }).click();
  await guest.getByRole('button', { name: 'Chat', exact: true }).click();
  const tonesBefore = await host.evaluate(
    () => (window as unknown as { chatTones: { count: number } }).chatTones.count,
  );

  const composer = guest.getByPlaceholder('Message everyone');
  await composer.click();
  await guest.keyboard.type('Homework');
  await guest.keyboard.press('Shift+Enter');
  await guest.keyboard.type('1. Sum of a vector');
  await guest.keyboard.press('Shift+Enter');
  await guest.keyboard.type('https://collaborare.ro/probleme/rec-suma-vector');
  await guest.keyboard.press('Enter');
  await expect(composer).toHaveValue('');

  const received = host.getByTestId('chat-message').last();
  await expect(received).toContainText('Homework');
  const text = await received.evaluate((node) => (node as HTMLElement).innerText);
  expect(text).toContain('Homework\n1. Sum of a vector\n');
  await expect(
    received.getByRole('link', { name: 'https://collaborare.ro/probleme/rec-suma-vector' }),
  ).toHaveAttribute('href', 'https://collaborare.ro/probleme/rec-suma-vector');
  await expect(received.getByText('Guest', { exact: true })).toBeVisible();
  await expect(received.getByText('G', { exact: true })).toBeVisible();
  await expect
    .poll(() =>
      host.evaluate(() => (window as unknown as { chatTones: { count: number } }).chatTones.count),
    )
    .toBe(tonesBefore + 3);

  await composer.click();
  await guest.keyboard.type('second message');
  await guest.keyboard.press('Enter');
  await expect(host.getByTestId('chat-message')).toHaveCount(2);
  await expect(
    host.getByTestId('chat-message').last().getByText('Guest', { exact: true }),
  ).toHaveCount(0);

  const own = guest.getByTestId('chat-message').first();
  await expect(own.getByText('You', { exact: true })).toBeVisible();
  await expect(own.getByRole('button', { name: 'Edit message' })).toBeVisible();
  await expect(own.getByRole('button', { name: 'Delete message' })).toBeVisible();
  expect(await guest.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('the code is still there after leaving the meeting and coming back', async ({ browser }) => {
  const host = await signedIn(browser, 'Host');
  await host.goto('/');
  await host.getByText('New meeting').first().click();
  await host.waitForURL(/room=/);
  const roomId = new URL(host.url()).searchParams.get('room') ?? '';

  await host.getByRole('button', { name: 'Code', exact: true }).click();
  await expect(host.locator('.monaco-editor').first()).toBeVisible();
  await host.locator('.monaco-editor .view-lines').first().click();
  await host.keyboard.press('ControlOrMeta+End');
  await host.keyboard.type('\n// homework stays here', { delay: 15 });
  await expect.poll(() => editorText(host)).toContain('// homework stays here');
  await expect
    .poll(() => host.evaluate((id) => localStorage.getItem(`collab.code.${id}`), roomId))
    .not.toBeNull();

  await host.getByRole('button', { name: 'Leave', exact: true }).click();
  await expect(host.getByPlaceholder('Meeting ID from an invite')).toBeVisible();
  await host.reload();

  await host.getByPlaceholder('Meeting ID from an invite').fill(roomId);
  await host.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(host.getByText(roomId).first()).toBeVisible();
  if (!(await host.locator('.monaco-editor').first().isVisible())) {
    await host.getByRole('button', { name: 'Code', exact: true }).click();
  }
  await expect(host.locator('.monaco-editor').first()).toBeVisible();
  await expect.poll(() => editorText(host)).toContain('// homework stays here');
});
