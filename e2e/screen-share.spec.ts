import { expect, test, type Browser, type Page } from '@playwright/test';

const SIGNALING = 'http://localhost:4000';

async function signedIn(
  browser: Browser,
  name: string,
  viewport = { width: 1440, height: 900 },
): Promise<Page> {
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
  const context = await browser.newContext({ viewport });
  await context.addInitScript((value) => {
    localStorage.setItem('collab.auth.token', value);
    // Headless Chromium has no screen picker; a canvas stands in for the shared screen.
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

interface Box {
  width: number;
  height: number;
}

/** The largest video on the page, which is the shared screen once it is being presented. */
async function largestVideo(page: Page): Promise<Box> {
  return page.evaluate(() => {
    const boxes = [...document.querySelectorAll('video')].map((video) => {
      const { width, height } = video.getBoundingClientRect();
      return { width, height };
    });
    return boxes.sort((a, b) => b.width - a.width)[0] ?? { width: 0, height: 0 };
  });
}

test('a shared screen is large by default and expands over the whole call', async ({ browser }) => {
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
  await expect(guest.getByLabel('Expand Host')).toBeVisible();

  await host.getByRole('button', { name: 'Share screen', exact: true }).click();
  await expect(guest.getByText('Sharing')).toBeVisible();

  // With nothing else on the stage the presented screen dominates the room.
  await expect.poll(async () => (await largestVideo(guest)).width).toBeGreaterThan(900);

  // Beside the editor it stays well above the old 180px thumbnail.
  await host.getByRole('button', { name: 'Code', exact: true }).click();
  await expect(guest.locator('.monaco-editor').first()).toBeVisible();
  await expect.poll(async () => (await largestVideo(guest)).width).toBeGreaterThan(400);
  const viewport = guest.viewportSize() ?? { width: 0, height: 0 };
  expect((await largestVideo(guest)).height).toBeLessThanOrEqual(viewport.height * 0.35);

  await guest.getByLabel('Expand Host').click();
  await expect(guest.getByLabel('Exit expanded view')).toBeVisible();
  await expect.poll(async () => (await largestVideo(guest)).width).toBe(viewport.width);
  expect((await largestVideo(guest)).height).toBeGreaterThan(viewport.height * 0.85);

  // The expanded stream is the only player for that peer, so its audio cannot double up.
  await expect(guest.locator('video')).toHaveCount(2);
  await expect
    .poll(() =>
      guest.evaluate(() => [...document.querySelectorAll('video')].some((v) => !v.paused)),
    )
    .toBe(true);

  // The editor is only covered, not torn down.
  await expect(guest.locator('.monaco-editor')).toHaveCount(1);

  await guest.keyboard.press('Escape');
  await expect(guest.getByLabel('Exit expanded view')).toBeHidden();
  await expect.poll(async () => (await largestVideo(guest)).width).toBeLessThan(viewport.width);

  // When the presenter stops, an expanded view has nothing left to show and closes itself.
  await guest.getByLabel('Expand Host').click();
  await expect(guest.getByLabel('Exit expanded view')).toBeVisible();
  await host.getByRole('button', { name: 'Stop share', exact: true }).click();
  await expect(guest.getByLabel('Exit expanded view')).toBeHidden();
});

test('on a phone the floating shared screen expands from its button', async ({ browser }) => {
  const host = await signedIn(browser, 'Host');
  await host.goto('/');
  await host.getByText('New meeting').first().click();
  await host.waitForURL(/room=/);
  const roomId = new URL(host.url()).searchParams.get('room') ?? '';

  const phone = { width: 390, height: 844 };
  const guest = await signedIn(browser, 'Guest', phone);
  await guest.goto('/');
  await guest.getByPlaceholder('Meeting ID from an invite').fill(roomId);
  await guest.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(guest.getByLabel('Expand Host')).toBeVisible();

  await host.getByRole('button', { name: 'Share screen', exact: true }).click();
  await host.getByRole('button', { name: 'Code', exact: true }).click();
  await expect(guest.locator('.monaco-editor').first()).toBeVisible();
  await expect.poll(async () => (await largestVideo(guest)).width).toBeGreaterThan(200);

  await guest.getByLabel('Expand Host').click();
  await expect(guest.getByLabel('Exit expanded view')).toBeVisible();
  await expect.poll(async () => (await largestVideo(guest)).width).toBe(phone.width);
});
