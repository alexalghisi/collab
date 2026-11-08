import { expect, test, type Browser, type Page, type Route } from '@playwright/test';

const SIGNALING = 'http://localhost:4000';
const SYNC = { name: 'Sync now', exact: true };
const CONNECT = { name: 'Connect', exact: true };

/** Stands in for Google's script: counts every window the app would have opened. */
const GOOGLE_STUB = `
  window.__googleWindows = 0;
  window.google = { accounts: {
    id: { initialize() {}, prompt() {} },
    oauth2: {
      initTokenClient: (config) => ({ requestAccessToken() {
        window.__googleWindows += 1;
        config.callback({ access_token: 'browser-token' });
      } }),
      initCodeClient: (config) => ({ requestCode() {
        window.__googleWindows += 1;
        config.callback({ code: 'one-time-code' });
      } }),
    },
  } };
`;

interface Backend {
  status: { configured: boolean; connected: boolean };
  token: (grant: unknown) => { status: number; json: unknown };
}

function fulfillCors(route: Route, status: number, json: unknown) {
  return route.fulfill({
    status,
    json,
    headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' },
  });
}

/** A signed-in page with Google Calendar marked connected on this device. */
async function calendarPage(browser: Browser, backend: Backend, grant?: string): Promise<Page> {
  const response = await fetch(`${SIGNALING}/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      displayName: 'Cal',
      email: `cal-${Date.now()}@e2e.test`,
      password: 'e2e-password-1',
    }),
  });
  const { token, user } = (await response.json()) as { token: string; user: { uid: string } };
  const context = await browser.newContext();
  await context.addInitScript(
    ({ session, uid, sealed }) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('collab.auth.token', session);
      localStorage.setItem(`collab.googleCalendar.${uid}`, '1');
      if (sealed) localStorage.setItem(`collab.googleCalendar.${uid}.grant`, sealed);
    },
    { session: token, uid: user.uid, sealed: grant ?? '' },
  );
  const page = await context.newPage();
  await page.route('https://accounts.google.com/gsi/client', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: GOOGLE_STUB }),
  );
  await page.route('https://www.googleapis.com/calendar/v3/**', (route) =>
    fulfillCors(route, 200, { items: [], nextSyncToken: 'next' }),
  );
  await page.route(`${SIGNALING}/calendar/status`, (route) =>
    fulfillCors(route, 200, backend.status),
  );
  await page.route(`${SIGNALING}/calendar/token`, (route) => {
    const answer = backend.token(route.request().postDataJSON()?.grant);
    return fulfillCors(route, answer.status, answer.json);
  });
  await page.route(`${SIGNALING}/calendar/connect`, (route) =>
    fulfillCors(route, 200, {
      accessToken: 'access',
      expiresIn: 3600,
      grant: 'sealed-after-connect',
    }),
  );
  await page.goto('/');
  await page.getByLabel('Calendar', { exact: true }).first().click();
  await expect(page.getByText('Google Calendar', { exact: true })).toBeVisible();
  return page;
}

function googleWindows(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __googleWindows: number }).__googleWindows);
}

test('Sync now keeps working from the sealed grant after the server lost its accounts', async ({
  browser,
}) => {
  const page = await calendarPage(
    browser,
    {
      status: { configured: true, connected: false },
      token: (grant) =>
        grant === 'sealed'
          ? { status: 200, json: { accessToken: 'access', expiresIn: 3600, grant: 'sealed' } }
          : { status: 404, json: { error: 'not_connected' } },
    },
    'sealed',
  );

  await page.getByRole('button', SYNC).click();

  await expect(page.getByText(/Live sync is on/)).toBeVisible();
  await expect(page.getByRole('button', SYNC)).toBeVisible();
  expect(await googleWindows(page)).toBe(0);
});

test('Sync now opens no Google window when the server fails briefly', async ({ browser }) => {
  const page = await calendarPage(
    browser,
    {
      status: { configured: true, connected: true },
      token: () => ({ status: 502, json: { error: 'Google Calendar did not answer.' } }),
    },
    'sealed',
  );

  await page.getByRole('button', SYNC).click();

  await expect(page.getByText(/try again/i)).toBeVisible();
  await expect(page.getByRole('button', SYNC)).toBeVisible();
  expect(await googleWindows(page)).toBe(0);
});

test('a grant that is really gone asks for one Connect, then lasts', async ({ browser }) => {
  let revoked = true;
  const page = await calendarPage(browser, {
    status: { configured: true, connected: false },
    token: (grant) =>
      revoked || grant !== 'sealed-after-connect'
        ? { status: 404, json: { error: 'not_connected' } }
        : { status: 200, json: { accessToken: 'access', expiresIn: 3600 } },
  });

  // The automatic sync finds no grant: nothing pops up, the button says what is needed.
  await expect(page.getByRole('button', CONNECT)).toBeVisible();
  expect(await googleWindows(page)).toBe(0);

  await page.getByRole('button', CONNECT).click();
  await expect(page.getByRole('button', SYNC)).toBeVisible();
  expect(await googleWindows(page)).toBe(1);

  revoked = false;
  await page.reload();
  await page.getByLabel('Calendar', { exact: true }).first().click();
  await page.getByRole('button', SYNC).click();
  await expect(page.getByText(/Live sync is on/)).toBeVisible();
  expect(await googleWindows(page)).toBe(0);
});
