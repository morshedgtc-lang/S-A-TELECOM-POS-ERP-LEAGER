import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider } from './auth';
import { PrefsProvider } from './i18n';
import App from './App';
import { initNative } from './native';
import '@fortawesome/fontawesome-free/css/all.min.css';
import '@fontsource/hind-siliguri/400.css';
import '@fontsource/hind-siliguri/600.css';
import '@fontsource/hind-siliguri/700.css';
import './styles.css';
import './site.css';
import './mobile.css';
import './dealers.css';
import './download.css';

initNative();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <PrefsProvider>
        <App />
      </PrefsProvider>
    </AuthProvider>
  </StrictMode>,
);
