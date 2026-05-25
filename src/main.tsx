import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import AppRouter from './router';
import './App.css';

createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <AppRouter />
  </StrictMode>,
);
