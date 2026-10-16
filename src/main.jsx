import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
// Self-hosted fonts — no Google Fonts request (works in China)
import '@fontsource/dm-sans/300.css'
import '@fontsource/dm-sans/400.css'
import '@fontsource/dm-sans/500.css'
import '@fontsource/dm-sans/600.css'
import '@fontsource/dm-sans/700.css'
import '@fontsource/rajdhani/600.css'
import '@fontsource/rajdhani/700.css'
import '@fontsource/space-grotesk/700.css'
import '@fontsource/dm-mono/400.css'
import '@fontsource/dm-mono/500.css'
import App from './App.jsx'
import { startVersionCheck } from './lib/versionCheck.js'

startVersionCheck();

// Browsers change a focused <input type="number">'s value when the mouse wheel
// scrolls over it — surprising and easy to trigger by accident while scrolling
// past a Qty/Price field. Blur it on wheel instead of trying to guard every
// number input individually across the whole app.
document.addEventListener('wheel', () => {
  if (document.activeElement?.type === 'number') document.activeElement.blur();
}, { passive: true });

// Cowork / automation session (ticked at sign-in): native confirm()/alert() dialogs would block
// the automated browser waiting for an OK click, so auto-accept them instead. The flag is read at
// call time, so it applies right after login without a reload and never affects normal sessions.
const _nativeConfirm = window.confirm.bind(window);
const _nativeAlert = window.alert.bind(window);
const _coworkOn = () => { try { return localStorage.getItem('ap_cowork_mode') === '1'; } catch { return false; } };
window.confirm = (msg) => { if (_coworkOn()) { console.info('[cowork] auto-confirmed:', msg); return true; } return _nativeConfirm(msg); };
window.alert = (msg) => { if (_coworkOn()) { console.info('[cowork] auto-dismissed alert:', msg); return; } return _nativeAlert(msg); };

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
