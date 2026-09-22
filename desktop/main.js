const crypto = require('node:crypto');
const path = require('node:path');
const { app, BrowserWindow, ipcMain, protocol, session } = require('electron');

const webDir = path.join(__dirname, 'web');
const DEFAULT_CLIENT_ID =
  '560742571865-eqeojukg2kqm2gmaumm79n2606e75pus.apps.googleusercontent.com';
const REDIRECT_URI = 'https://alexalghisi.github.io/collab';

function performGoogleOAuth({
  clientId = DEFAULT_CLIENT_ID,
  scope,
  responseType = 'token id_token',
  prompt = 'select_account',
}) {
  return new Promise((resolve, reject) => {
    const nonce = crypto.randomUUID();
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
    authUrl.searchParams.set('response_type', responseType);
    authUrl.searchParams.set('scope', scope);
    authUrl.searchParams.set('nonce', nonce);
    if (prompt) {
      authUrl.searchParams.set('prompt', prompt);
    }

    const authWindow = new BrowserWindow({
      width: 520,
      height: 680,
      show: true,
      title: 'Sign in with Google',
      autoHideMenuBar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    });

    // Strip Electron from User-Agent so Google allows the OAuth web flow
    const chromeUserAgent =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
    authWindow.webContents.setUserAgent(chromeUserAgent);

    let completed = false;

    function finishWith(callback) {
      if (completed) return;
      completed = true;
      setImmediate(() => {
        if (!authWindow.isDestroyed()) {
          authWindow.destroy();
        }
      });
      callback();
    }

    function handleUrl(rawUrl) {
      if (!rawUrl || !rawUrl.startsWith(REDIRECT_URI)) {
        return false;
      }
      try {
        const parsed = new URL(rawUrl);
        const hash = parsed.hash.startsWith('#') ? parsed.hash.slice(1) : parsed.hash;
        const hashParams = new URLSearchParams(hash);
        const searchParams = parsed.searchParams;

        const accessToken = hashParams.get('access_token') || searchParams.get('access_token');
        const idToken = hashParams.get('id_token') || searchParams.get('id_token');
        const error = hashParams.get('error') || searchParams.get('error');

        if (error) {
          finishWith(() =>
            reject(new Error(error === 'access_denied' ? 'Google sign-in was cancelled.' : error)),
          );
          return true;
        }

        if (accessToken || idToken) {
          finishWith(() =>
            resolve({
              accessToken: accessToken || undefined,
              idToken: idToken || undefined,
            }),
          );
          return true;
        }

        finishWith(() => reject(new Error('Google sign-in did not return credentials.')));
        return true;
      } catch (err) {
        finishWith(() => reject(err));
        return true;
      }
    }

    authWindow.webContents.on('will-redirect', (event, url) => {
      if (handleUrl(url)) {
        event.preventDefault();
      }
    });

    authWindow.webContents.on('will-navigate', (event, url) => {
      if (handleUrl(url)) {
        event.preventDefault();
      }
    });

    authWindow.webContents.on('did-navigate', (_event, url) => {
      handleUrl(url);
    });

    authWindow.on('closed', () => {
      if (!completed) {
        completed = true;
        reject(new Error('Google sign-in was cancelled.'));
      }
    });

    authWindow.loadURL(authUrl.toString());
  });
}

/**
 * The web export references its bundle and assets with root-absolute paths
 * (/_expo/..., /assets/...). Over file:// those would point at the filesystem
 * root, so anything outside the web folder is remapped into it.
 */
function serveWebFolder() {
  protocol.interceptFileProtocol('file', (request, callback) => {
    const requested = decodeURIComponent(new URL(request.url).pathname);
    callback({ path: requested.startsWith(webDir) ? requested : path.join(webDir, requested) });
  });
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#0b1120',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
    },
  });

  window.loadFile(path.join(webDir, 'index.html'));
}

app.whenReady().then(() => {
  serveWebFolder();
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'media');
  });

  ipcMain.handle('auth:google', async (_event, clientId) => {
    return performGoogleOAuth({
      clientId: clientId || DEFAULT_CLIENT_ID,
      scope: 'openid email profile',
      responseType: 'token id_token',
      prompt: 'select_account',
    });
  });

  ipcMain.handle('auth:google-calendar', async (_event, { clientId, prompt } = {}) => {
    const result = await performGoogleOAuth({
      clientId: clientId || DEFAULT_CLIENT_ID,
      scope: 'https://www.googleapis.com/auth/calendar.events',
      responseType: 'token',
      prompt: prompt || 'consent',
    });
    return result.accessToken;
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
