import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// When building for Electron (`vite build --mode electron`), asset paths must
// be relative (`./`) so the app works when loaded from file:// URLs.
// The normal web build continues to use absolute paths (`/`).
export default defineConfig(({ mode }) => ({
  base: mode === 'electron' ? './' : '/',
  plugins: [react()],
}))
