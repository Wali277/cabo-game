/**
 * Electron preload script.
 *
 * contextIsolation is enabled so this file runs in a privileged context
 * between main and renderer. The Cobo game uses no Electron-specific APIs,
 * so nothing is exposed to the renderer via contextBridge.
 *
 * Keep this file — removing the preload reference in main.js disables the
 * security sandbox. Add contextBridge.exposeInMainWorld() here if you ever
 * need to call Electron APIs (e.g. native dialogs) from the React app.
 */
