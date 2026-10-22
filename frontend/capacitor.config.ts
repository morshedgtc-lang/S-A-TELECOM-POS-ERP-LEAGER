import type { CapacitorConfig } from '@capacitor/cli';

// Android and iOS apps wrap the same React build (dist/). They talk to the server URL
// the user enters on the login screen (stored on the device), e.g. the Railway domain.
const config: CapacitorConfig = {
  appId: 'com.satelecom.pos',
  appName: 'SA Telecom POS',
  webDir: 'dist',
  backgroundColor: '#16121a',
  plugins: {
    SplashScreen: {
      launchShowDuration: 900,
      launchAutoHide: true,
      backgroundColor: '#16121a',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#16121a',
      overlaysWebView: false,
    },
  },
};

export default config;
