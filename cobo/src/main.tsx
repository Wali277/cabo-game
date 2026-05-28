import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { useStore } from './state/store'

if (import.meta.env.DEV) {
  // Dev-only test hook: drive the Zustand store directly from the preview
  // console for fast scenario setup. Stripped from production builds.
  (window as unknown as { cabo?: typeof useStore }).cabo = useStore
}

createRoot(document.getElementById('root')!).render(<App />)
