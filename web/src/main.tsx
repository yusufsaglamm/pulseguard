import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';

// Initialize persisted theme before first paint
if (localStorage.getItem('pulseguard_theme') === 'light') {
  document.documentElement.setAttribute('data-theme', 'light');
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
