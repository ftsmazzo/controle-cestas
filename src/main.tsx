import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import AdminGate from './components/AdminGate';
import { AppModeProvider, useAppMode } from './context/AppModeContext';
import App from './App';
import './App.css';

function Root() {
  const { isAdminRoute } = useAppMode();
  if (isAdminRoute) {
    return (
      <AdminGate>
        <App />
      </AdminGate>
    );
  }
  return <App />;
}

createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <AppModeProvider>
      <Root />
    </AppModeProvider>
  </StrictMode>,
);
