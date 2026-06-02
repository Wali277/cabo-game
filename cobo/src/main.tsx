import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { useStore } from './state/store'
import { ErrorBoundary } from './ui/ErrorBoundary'
import { installDebugCapture } from './state/debugLog'

// Capture uncaught errors, promise rejections and console.error/warn BEFORE
// React mounts, so first-paint crashes are reported in DevTools Console.
// Intentionally NOT gated on DEV - production errors need the same context.
installDebugCapture()

if (import.meta.env.DEV) {
  // Dev-only test hook: drive the Zustand store directly from the preview
  // console for fast scenario setup. Stripped from production builds.
  (window as unknown as { cabo?: typeof useStore }).cabo = useStore
}

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
)
