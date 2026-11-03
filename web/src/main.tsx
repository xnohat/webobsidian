import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/obsidian.css';
import {initializeLanguage} from './lib/i18n/runtime';

initializeLanguage();

// NOTE: /share/<id> never reaches the SPA — the server renders it (SEO/OG SSR).

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
