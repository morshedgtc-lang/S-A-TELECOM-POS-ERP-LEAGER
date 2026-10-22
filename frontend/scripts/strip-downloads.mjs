// The website serves the APK from dist/downloads; the apps themselves must not contain it
// (otherwise every new APK would carry the previous one). Run between `build` and `cap sync`.
import { rmSync } from 'node:fs';

rmSync('dist/downloads', { recursive: true, force: true });
console.log('Removed dist/downloads from the app bundle');
