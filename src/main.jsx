import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(<App />);

// PWA: offline + installable (skipped in the single-file build and on file://)
if (import.meta.env.MODE !== 'single' && 'serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
