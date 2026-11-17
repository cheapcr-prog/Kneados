import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { CrashScreen } from './components/CrashScreen';
import { reloadForNewVersion } from './lib/freshLoad';
import { DemoProvider } from './data/store';
import './index.css';

// A page left open across a new version asks for files that no longer exist. Reload once to get the new ones.
window.addEventListener('vite:preloadError', (event) => { if (reloadForNewVersion()) event.preventDefault(); });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CrashScreen>
      <BrowserRouter>
        <DemoProvider>
          <App />
        </DemoProvider>
      </BrowserRouter>
    </CrashScreen>
  </StrictMode>,
);
