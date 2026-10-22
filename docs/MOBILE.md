# Android and iPhone apps

The apps are the same React app as the website, wrapped with [Capacitor 8](https://capacitorjs.com/). Every feature (dashboard, service tracker, POS, stock, IMEI lookup, reports, staff, website editor) works in the apps, with the same permissions as the web: Super Admin, Admin, Manager and Staff each see only what their role allows.

## How the apps connect

The apps talk to the shop's server — the Railway domain, for example `https://your-shop.up.railway.app`.

- On first launch, the login screen asks for the **server address**. Tap the plug button to check it, then sign in. The address is saved on the phone.
- To skip that step, build the app with the address built in: set the GitHub repository variable `SERVER_URL`, or type it in "Run workflow".
- The server must use **https** (Railway does). The backend already accepts requests from the apps (`NATIVE_ORIGINS` in `backend/src/config.js`).

## What is different in the app

| Feature | Website | App |
|---------|---------|-----|
| Public home page | Shown at `/` | Skipped — the app opens at login, or straight to the dashboard |
| Print invoice / job card | 80 mm print window | Share sheet (WhatsApp, Messenger, SMS, or a Bluetooth printer app) |
| Navigation on a phone | Bottom tab bar + side menu | Same, plus the Android back button |
| Status bar, splash, icon | — | Dark status bar, rose splash and launcher icon |

## Build the Android APK

### Option A — GitHub (no setup on your PC)

1. Push to GitHub. The **Mobile apps** workflow runs on every frontend change to `main` (or use Actions → Mobile apps → Run workflow).
2. Open the finished run and download **sa-telecom-pos-android-debug** → `app-debug.apk`.
3. Send the APK to the phone, open it and allow "install unknown apps".

For a signed release APK and a Play Store bundle (`.aab`), add these repository secrets: `ANDROID_KEYSTORE_BASE64` (the `.jks` file, base64), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` and `ANDROID_KEY_PASSWORD`. Keep the keystore safe: Play Store updates must be signed with the same key.

### Option B — on this PC

Needs JDK 21 (installed) and the Android SDK (Android Studio installs it).

```bash
cd frontend
npm run app:sync
cd android
gradlew assembleDebug
```

The APK is written to `frontend/android/app/build/outputs/apk/debug/app-debug.apk`. `npm run android:open` opens the project in Android Studio.

## Build the iPhone app

iPhone apps can only be compiled on a Mac with Xcode. The GitHub workflow checks the iOS project compiles on a Mac runner, but an app you can install on iPhones needs:

1. An **Apple Developer account** (USD 99 per year), in the shop owner's name.
2. A Mac (or a cloud Mac such as GitHub's macOS runners or Codemagic) to sign the app.
3. Distribution through **TestFlight** (staff install the TestFlight app and accept an invite) or the App Store.

On a Mac: `cd frontend && npm install && npm run app:sync && npm run ios:open`, set the team under *Signing & Capabilities*, then *Product → Archive*. The iOS project uses Swift Package Manager, so CocoaPods is not needed.

## Changing the icon

`frontend/scripts/make-icons.mjs` draws the icon and splash screens (no image tools needed). Edit the colours or shapes there and run `npm run app:icons`.

## Updating the apps

The apps contain a copy of the web build. After changing the frontend: `npm run app:sync`, then build again (or let the workflow do it). Backend changes need no new app build.
