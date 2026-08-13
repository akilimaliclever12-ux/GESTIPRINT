import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { reloadOnceForStale } from './lib/staleReload.js';
import './styles/index.css';

// After a new deploy, importing a lazy route chunk from the old page fails
// ("Failed to fetch dynamically imported module"). Vite fires this event —
// recover seamlessly by reloading once instead of showing an error screen.
window.addEventListener('vite:preloadError', (e) => {
  e.preventDefault?.();
  reloadOnceForStale();
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
