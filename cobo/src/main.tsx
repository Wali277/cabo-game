import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { useStore } from './state/store'
import { ErrorBoundary } from './ui/ErrorBoundary'
import { SkinPreviewHarness } from './ui/dev/SkinPreviewHarness'
import { WallpaperPreviewHarness } from './ui/dev/WallpaperPreviewHarness'
import { TokenPurchaseOverlay } from './ui/account/TokenPurchaseOverlay'
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

// Dev-only skin gallery: `?skins` renders the standalone SkinPreviewHarness
// instead of the app (no Supabase login needed). The normal mount is untouched.
// `?walls` renders the standalone WallpaperPreviewHarness (table backgrounds).
const params = new URLSearchParams(window.location.search)
const showSkins = import.meta.env.DEV && params.has('skins')
const showWalls = import.meta.env.DEV && params.has('walls')

// Dev-only: `?tokengrant=N` renders an ISOLATED preview of the token-purchase
// celebration overlay (like `?skins`/`?walls`) — no <App>/initAuth to clobber
// the stub — so it can be screenshotted without a real Ko-fi purchase. Stripped
// from production builds. We pre-populate the store synchronously so the
// self-gating overlay (gated on account + tokenGrant) renders immediately.
const showTokenGrant = import.meta.env.DEV && params.has('tokengrant')
if (showTokenGrant) {
  const n = Math.max(1, Math.floor(Number(params.get('tokengrant')) || 3))
  useStore.setState({
    account: {
      profile: {
        id: 'dev-preview', username: 'You', total_xp: 0, level: 1, tokens: n,
        unlocked_skins: [], unlocked_wallpapers: [], active_skin: null,
        active_wallpaper: null, custom_card_colors: null,
      },
    },
    tokenGrant: { amount: n },
  })
}

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    {showSkins ? (
      <SkinPreviewHarness />
    ) : showWalls ? (
      <WallpaperPreviewHarness />
    ) : showTokenGrant ? (
      <div style={{ minHeight: '100vh', background: 'radial-gradient(120% 90% at 50% -10%, #15151a 0%, #0a0a0c 60%)' }}>
        <TokenPurchaseOverlay />
      </div>
    ) : (
      <App />
    )}
  </ErrorBoundary>,
)
