// Tells whether the app runs inside a NATIVE shell (Capacitor APK / Tauri .exe)
// vs a normal web browser (Vercel). Used to (1) skip the marketing landing in
// the installed apps and go straight to login, and (2) hide the PWA "install"
// prompts that make no sense once the app is already installed.
import { Capacitor } from '@capacitor/core';

export function isNativeApp() {
  if (typeof window === 'undefined') return false;
  try {
    if (Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform()) return true;
  } catch {
    /* not in Capacitor */
  }
  // Tauri v2 injects these globals in the desktop webview.
  return !!(window.__TAURI_INTERNALS__ || window.__TAURI__);
}

// 'android' | 'ios' | 'desktop' | 'web'
export function nativePlatform() {
  if (typeof window === 'undefined') return 'web';
  try {
    const p = Capacitor && Capacitor.getPlatform && Capacitor.getPlatform();
    if (p && p !== 'web') return p; // 'android' | 'ios'
  } catch {
    /* ignore */
  }
  if (window.__TAURI_INTERNALS__ || window.__TAURI__) return 'desktop';
  return 'web';
}

// Best-guess of the visitor's device from the browser (for the download chooser
// on the WEB landing). Returns 'android' | 'ios' | 'windows' | 'other'.
export function guessDevice() {
  const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
  if (/android/i.test(ua)) return 'android';
  if (/iphone|ipad|ipod/i.test(ua) || (/\bMac\b/.test(ua) && 'ontouchend' in document)) return 'ios';
  if (/windows/i.test(ua)) return 'windows';
  return 'other';
}
