import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';

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
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript((value) => {
    localStorage.setItem('collab.auth.token', value);
    navigator.mediaDevices.getDisplayMedia = async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 1920;
      canvas.height = 1080;
      const paint = canvas.getContext('2d');
      window.setInterval(() => {
        if (paint) {
          paint.fillStyle = `hsl(${Date.now() % 360} 80% 50%)`;
          paint.fillRect(0, 0, 1920, 1080);
        }
      }, 100);
      return canvas.captureStream(10);
    };
  }, token);
  return context.newPage();
}

async function inCall(browser: Browser): Promise<{ host: Page; guest: Page }> {
  const host = await signedIn(browser, 'Host');
  await host.goto('/');
  await host.getByText('New meeting').first().click();
  await host.waitForURL(/room=/);
  const roomId = new URL(host.url()).searchParams.get('room') ?? '';

  const guest = await signedIn(browser, 'Guest');
  await guest.goto('/');
  await guest.getByPlaceholder('Meeting ID from an invite').fill(roomId);
  await guest.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(guest.getByLabel('Expand Host')).toBeVisible();
  return { host, guest };
}

async function boxOf(locator: Locator): Promise<{ x: number; y: number; width: number }> {
  const box = await locator.boundingBox();
  return { x: box?.x ?? 0, y: box?.y ?? 0, width: box?.width ?? 0 };
}

async function drag(page: Page, from: Locator, dx: number, dy: number): Promise<void> {
  const box = await from.boundingBox();
  const startX = (box?.x ?? 0) + (box?.width ?? 0) / 2;
  const startY = (box?.y ?? 0) + (box?.height ?? 0) / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + dx / 2, startY + dy / 2, { steps: 5 });
  await page.mouse.move(startX + dx, startY + dy, { steps: 5 });
  await page.mouse.up();
}

test('a shared screen floats over the whiteboard and can be moved and resized', async ({
  browser,
}) => {
  const { host, guest } = await inCall(browser);

  await host.getByRole('button', { name: 'Share screen', exact: true }).click();
  await host.getByRole('button', { name: 'Whiteboard', exact: true }).click();

  const shared = guest.getByLabel("Host's screen, movable window");
  await expect(shared).toBeVisible();
  const start = await boxOf(shared);

  await drag(guest, guest.getByLabel('Drag to move'), -300, 250);
  const moved = await boxOf(shared);
  expect(moved.x).toBeCloseTo(start.x - 300, 0);
  expect(moved.y).toBeCloseTo(start.y + 250, 0);
  expect(moved.width).toBeCloseTo(start.width, 0);

  await drag(guest, guest.getByLabel('Drag to resize'), 160, 90);
  const resized = await boxOf(shared);
  expect(resized.width).toBeGreaterThan(moved.width + 100);
  expect(resized.x).toBeCloseTo(moved.x, 0);

  await guest.getByLabel('Return to the tile strip').click();
  await expect(shared).toBeHidden();
  await expect(guest.getByLabel('Expand Host')).toBeVisible();

  await guest.getByRole('button', { name: 'Pop out screen' }).click();
  await expect(shared).toBeVisible();
  await expect(guest.locator('video')).toHaveCount(2);
});

test('the chat panel moves to the left of the call and stays there', async ({ browser }) => {
  const { guest } = await inCall(browser);

  await guest.getByRole('button', { name: 'Chat', exact: true }).click();
  const input = guest.getByPlaceholder('Message everyone');
  await expect(input).toBeVisible();
  expect((await boxOf(input)).x).toBeGreaterThan(1000);

  await guest.getByLabel('Move panel to the left').click();
  await expect.poll(async () => (await boxOf(input)).x).toBeLessThan(340);

  await drag(guest, guest.getByLabel('Close panel').locator('..'), 900, 20);
  await expect.poll(async () => (await boxOf(input)).x).toBeGreaterThan(1000);

  await drag(guest, guest.getByLabel('Close panel').locator('..'), -900, 20);
  await expect.poll(async () => (await boxOf(input)).x).toBeLessThan(340);

  await guest.reload();
  await guest.getByRole('button', { name: 'Chat', exact: true }).click();
  await expect(guest.getByLabel('Move panel to the right')).toBeVisible();
});

test('text pasted on the whiteboard is rendered for everyone', async ({ browser }) => {
  const { host, guest } = await inCall(browser);

  await host.getByRole('button', { name: 'Whiteboard', exact: true }).click();
  await expect(guest.getByText('Paste text or drop a file')).toBeVisible();

  await guest.evaluate(() => {
    const data = new DataTransfer();
    data.setData('text/plain', 'f(97,0) -> 97\nf(48,1) -> 48');
    window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }));
  });

  await expect(guest.getByText(/f\(97,0\) -> 97/)).toBeVisible();
  await expect(host.getByText(/f\(97,0\) -> 97/)).toBeVisible();
  await expect(host.getByText(/f\(48,1\) -> 48/)).toBeVisible();
});
