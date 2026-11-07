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

async function typeAtEnd(page: Page, text: string): Promise<void> {
  const editor = page.locator('.monaco-editor .view-lines').first();
  await editor.click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type(text, { delay: 15 });
}

test('both people type in the same code and see each other live', async ({ browser }) => {
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

  // The stage is shared: one press puts the editor on both screens.
  await host.getByRole('button', { name: 'Code', exact: true }).click();
  await expect(host.locator('.monaco-editor').first()).toBeVisible();
  await expect(guest.locator('.monaco-editor').first()).toBeVisible();

  await typeAtEnd(host, '\n// scris de host');
  await expect.poll(() => editorText(guest)).toContain('// scris de host');

  await typeAtEnd(guest, '\n// scris de guest');
  await expect.poll(() => editorText(host)).toContain('// scris de guest');

  // Typing at the same time keeps one document, the same on both screens.
  await Promise.all([typeAtEnd(host, '\n// h2'), typeAtEnd(guest, '\n// g2')]);
  await expect.poll(async () => (await editorText(host)) === (await editorText(guest))).toBe(true);
  const merged = await editorText(host);
  expect(merged).toContain('// h2');
  expect(merged).toContain('// g2');

  // Deleting one character removes exactly that character on both screens.
  await host.evaluate(() => {
    const api = (
      window as unknown as { monaco: { editor: { getModels(): { setValue(v: string): void }[] } } }
    ).monaco;
    api.editor.getModels()[0]?.setValue('int main() {\n  int x = 12;\n  return 0;\n}\n');
  });
  await expect.poll(() => editorText(guest)).toContain('int x = 12;');
  await guest.locator('.monaco-editor .view-lines').first().click();
  await guest.keyboard.press('ControlOrMeta+Home');
  await guest.keyboard.press('ArrowDown');
  await guest.keyboard.press('End');
  await guest.keyboard.press('ArrowLeft');
  await guest.keyboard.press('Backspace');
  const expected = ['int main() {', '  int x = 1;', '  return 0;', '}', ''];
  for (const page of [host, guest]) {
    await expect
      .poll(async () => (await editorText(page)).replace(/\r\n/g, '\n').split('\n'))
      .toEqual(expected);
  }
  // And nobody's editor is left on CRLF, which is what shifted deletes before.
  for (const page of [host, guest]) {
    expect(await editorText(page)).not.toContain('\r');
  }

  // Deleting a line in the middle never eats anything else, e.g. the last line.
  await host.evaluate(() => {
    const api = (
      window as unknown as { monaco: { editor: { getModels(): { setValue(v: string): void }[] } } }
    ).monaco;
    api.editor.getModels()[0]?.setValue('int main() {\n  int x;\n  return 0;\n}\n');
  });
  await expect.poll(() => editorText(guest)).toContain('  int x;');
  await guest.locator('.monaco-editor .view-lines').first().click();
  await guest.keyboard.press('ControlOrMeta+Home');
  await guest.keyboard.press('ArrowDown');
  await guest.keyboard.press('Home');
  await guest.keyboard.press('Home');
  await guest.keyboard.press('Shift+ArrowDown');
  await guest.keyboard.press('Backspace');
  const afterDelete = 'int main() {\n  return 0;\n}\n';
  await expect.poll(() => editorText(guest)).toBe(afterDelete);
  await expect.poll(() => editorText(host)).toBe(afterDelete);
});
