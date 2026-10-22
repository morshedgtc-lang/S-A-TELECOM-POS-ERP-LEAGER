import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { StatusBar, Style } from '@capacitor/status-bar';

/** True inside the Android / iOS app, false in a normal browser. */
export const isNative = Capacitor.isNativePlatform();

const SERVER_KEY = 'sa_pos_server';
const BUILT_IN_SERVER: string = import.meta.env.VITE_SERVER_URL ?? '';

/** The shop's server (e.g. the Railway domain). Only used by the apps; the website calls its own origin. */
export function getServer(): string {
  try {
    return localStorage.getItem(SERVER_KEY) || BUILT_IN_SERVER;
  } catch {
    return BUILT_IN_SERVER;
  }
}

export function normalizeServer(input: string): string {
  let s = input.trim().replace(/\/+$/, '');
  if (s && !/^https?:\/\//i.test(s)) s = `https://${s}`;
  return s;
}

export function setServer(url: string) {
  try {
    localStorage.setItem(SERVER_KEY, normalizeServer(url));
  } catch {
    // Without storage the built-in server is used.
  }
}

export function apiBase(): string {
  if (!isNative) return import.meta.env.VITE_API_URL ?? '/api';
  const server = getServer();
  if (!server) throw new Error('Set the shop server address on the login screen first');
  return `${server}/api`;
}

/** Status bar colours and the Android back button. Safe to call in the browser (does nothing). */
export function initNative() {
  if (!isNative) return;
  document.documentElement.classList.add('native');
  StatusBar.setStyle({ style: Style.Dark }).catch(() => undefined);
  if (Capacitor.getPlatform() === 'android') {
    StatusBar.setBackgroundColor({ color: '#16121a' }).catch(() => undefined);
  }
  App.addListener('backButton', ({ canGoBack }) => {
    const atHome = window.location.pathname === '/app' || window.location.pathname === '/login';
    if (canGoBack && !atHome) window.history.back();
    else App.minimizeApp();
  }).catch(() => undefined);
}

/** Opens the phone's share sheet (WhatsApp, Messenger, SMS, a Bluetooth printer app…). */
export async function shareText(title: string, text: string) {
  await Share.share({ title, text, dialogTitle: title });
}
