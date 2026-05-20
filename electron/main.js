/**
 * Electron main process for the Cobo desktop app.
 *
 * Loads the Vite-built React frontend (cobo/dist/index.html) via file://.
 * Single-player runs fully offline. Multiplayer connects to the cloud server
 * whose URL was baked into the build via VITE_SERVER_URL (.env.electron).
 */
const { app, BrowserWindow, shell, session } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    title: 'Cobo',
    icon: path.join(__dirname, '../build/icon.png'),
    backgroundColor: '#0d1638',   // matches the body/cosmic gradient — no flash on load
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      // sandbox: true removed — contextIsolation + nodeIntegration:false is
      // sufficient security for a game. Sandbox adds process overhead that
      // makes animations feel sluggish.
      backgroundThrottling: false, // keep RAF/animation loops running at full
                                   // speed even when the window isn't focused
    },
  });

  // Content-Security-Policy: allow inline scripts/styles from the Vite build,
  // file:// and blob: assets, and WebSocket + HTTPS connections to the deployed
  // multiplayer server (both Render and Fly.io domains are whitelisted).
  // Fonts are now self-hosted in /fonts/ so no external font CDN needed.
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self' file: data: blob:; " +
          "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
          "style-src 'self' 'unsafe-inline'; " +
          "connect-src 'self' wss: ws: https: " +
          "wss://*.onrender.com https://*.onrender.com " +
          "wss://*.fly.dev https://*.fly.dev; " +
          "img-src 'self' file: data: blob:; " +
          "media-src 'self' file: data: blob:; " +
          "font-src 'self' file: data: blob:;"
        ],
      },
    });
  });

  // Load the built app — works both when running via `electron .` in dev
  // and when packaged inside an asar archive (Electron patches the fs APIs).
  win.loadFile(path.join(__dirname, '../cobo/dist/index.html'));

  // External links (e.g. "How to play" docs) open in the system browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Intercept same-window navigations to external URLs.
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });
}

app.whenReady().then(() => {
  createWindow();
  // macOS: re-create window when dock icon is clicked and no windows are open.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Quit when all windows are closed (Windows / Linux behaviour).
// On macOS this is typically overridden — handled by 'activate' above.
app.on('window-all-closed', () => {
  app.quit();
});
