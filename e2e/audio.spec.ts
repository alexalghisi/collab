import { expect, test, type Browser, type Page } from '@playwright/test';

const SIGNALING = 'http://localhost:4000';

/** A signed-in browser whose RTCPeerConnections the test can inspect. */
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
    const Native = window.RTCPeerConnection;
    const all: RTCPeerConnection[] = [];
    (window as unknown as { __pcs: RTCPeerConnection[] }).__pcs = all;
    window.RTCPeerConnection = class extends Native {
      constructor(config?: RTCConfiguration) {
        super(config);
        all.push(this);
      }
    } as typeof RTCPeerConnection;
  }, token);
  return context.newPage();
}

/** Audio bytes this page has received from the other side, over all its connections. */
async function audioBytesReceived(page: Page): Promise<number> {
  return page.evaluate(async () => {
    let total = 0;
    for (const pc of (window as unknown as { __pcs: RTCPeerConnection[] }).__pcs) {
      (await pc.getStats()).forEach(
        (report: { type: string; kind?: string; bytesReceived?: number }) => {
          if (report.type === 'inbound-rtp' && report.kind === 'audio') {
            total += report.bytesReceived ?? 0;
          }
        },
      );
    }
    return total;
  });
}

/** Whether the remote voice reaches a playing, audible sink on this page. */
async function remoteAudioPlays(page: Page): Promise<boolean> {
  return page.evaluate(() =>
    [...document.querySelectorAll('audio')].some((audio) => {
      const stream = audio.srcObject as MediaStream | null;
      const live = stream?.getAudioTracks().some((track) => track.readyState === 'live') ?? false;
      // Muted only when the shared Web Audio context is playing it instead.
      return live && !audio.paused && (!audio.muted || audio.hasAttribute('data-silent'));
    }),
  );
}

test('the signaling server hands out a TURN relay on /ice', async () => {
  const response = await fetch(`${SIGNALING}/ice`);
  expect(response.status).toBe(200);
  const body = (await response.json()) as { iceServers: { urls: string | string[] }[] };
  expect(body.iceServers.length).toBeGreaterThan(0);
});

test('both people hear each other', async ({ browser }) => {
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

  // Audio flows guest -> host AND host -> guest, and keeps flowing.
  await expect.poll(() => audioBytesReceived(host), { timeout: 30_000 }).toBeGreaterThan(2000);
  await expect.poll(() => audioBytesReceived(guest), { timeout: 30_000 }).toBeGreaterThan(2000);
  const hostBefore = await audioBytesReceived(host);
  const guestBefore = await audioBytesReceived(guest);
  await host.waitForTimeout(2000);
  expect(await audioBytesReceived(host)).toBeGreaterThan(hostBefore);
  expect(await audioBytesReceived(guest)).toBeGreaterThan(guestBefore);

  // And each side actually plays it.
  await expect.poll(() => remoteAudioPlays(host)).toBe(true);
  await expect.poll(() => remoteAudioPlays(guest)).toBe(true);
});
