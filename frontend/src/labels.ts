import type { RepairStatus } from './types';

/** Repair status names and colours, matching the legacy service tracker. */
export const STATUS: Record<RepairStatus, { label: string; bn: string; color: string }> = {
  in_work: { label: 'In Work', bn: 'কাজ চলছে', color: '#ff9800' },
  out_work: { label: 'Out Work', bn: 'কারিগরের কাছে', color: '#1e88e5' },
  success: { label: 'Success', bn: 'ঠিক হয়েছে', color: '#8e24aa' },
  failed: { label: 'Unsuccess', bn: 'ঠিক হয়নি', color: '#c62828' },
  delivered: { label: 'Delivered', bn: 'ডেলিভারি হয়েছে', color: '#2e7d32' },
};

/** Status moves the API allows (delivery has its own form). */
export const NEXT_STATUS: Record<RepairStatus, RepairStatus[]> = {
  in_work: ['out_work', 'success', 'failed'],
  out_work: ['in_work', 'success', 'failed'],
  success: [],
  failed: [],
  delivered: [],
};

export const REF_TYPE_BN: Record<string, string> = {
  sale: 'বিক্রয়',
  purchase: 'ক্রয়',
  expense: 'খরচ',
  customer_collection: 'কাস্টমার বাকি আদায়',
  supplier_payment: 'সাপ্লায়ার পেমেন্ট',
  account_opening: 'ওপেনিং ব্যালেন্স',
  repair_advance: 'সার্ভিস অগ্রিম',
  repair_payment: 'সার্ভিস পেমেন্ট',
  repair_refund: 'সার্ভিস রিফান্ড',
  technician_payment: 'কারিগর মজুরি',
  sale_return: 'বিক্রয় রিটার্ন',
};

/** Formats an SQLite UTC timestamp ("YYYY-MM-DD HH:MM:SS") in local time. */
export function fmtDate(value: string | null | undefined, withTime = true): string {
  if (!value) return '—';
  const d = new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`);
  if (Number.isNaN(d.getTime())) return value;
  return withTime
    ? d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Role display names (Bangla keys for t()). owner is the Super Admin. */
export const ROLE_LABEL = {
  owner: 'সুপার অ্যাডমিন',
  admin: 'অ্যাডমিন',
  manager: 'ম্যানেজার',
  staff: 'স্টাফ',
} as const;

export const ROLE_RANK = { owner: 4, admin: 3, manager: 2, staff: 1 } as const;
