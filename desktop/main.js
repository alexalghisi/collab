const path = require('node:path');
const { app, BrowserWindow, protocol, session } = require('electron');

const webDir = path.join(__dirname, 'web');

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
