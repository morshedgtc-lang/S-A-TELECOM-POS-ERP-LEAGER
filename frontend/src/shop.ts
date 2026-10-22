import { api } from './api';
import type { ShopSettings } from './types';

let cached: Promise<ShopSettings> | null = null;

/** Shop profile used on printed slips. Cached for the session; call refreshShop after saving. */
export function getShop(): Promise<ShopSettings> {
  if (!cached) cached = api<ShopSettings>('GET', '/settings').catch((e) => { cached = null; throw e; });
  return cached;
}

export function refreshShop(value: ShopSettings) {
  cached = Promise.resolve(value);
}
