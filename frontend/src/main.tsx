import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider } from './auth';
import { PrefsProvider } from './i18n';
import App from './App';
import './styles.css';
import './site.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <PrefsProvider>
        <App />
      </PrefsProvider>
    </AuthProvider>
  </StrictMode>,
);
