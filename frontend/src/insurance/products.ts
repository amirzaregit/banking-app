import type { Ionicons } from '@expo/vector-icons';

import type { InsuranceDetails, InsuranceProduct } from '@/api/types';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

// The choices each product offers. The server owns the prices and validates everything again
// (backend/app/services/insurance.py): these lists only decide what the form shows.
export const PRODUCTS: { id: InsuranceProduct; icon: IconName; plans: string[] }[] = [
  { id: 'travel', icon: 'airplane-outline', plans: ['basic', 'standard', 'premium'] },
  { id: 'medical', icon: 'medkit-outline', plans: ['basic', 'standard', 'premium'] },
  { id: 'car', icon: 'car-outline', plans: ['liability', 'full'] },
  { id: 'home', icon: 'home-outline', plans: ['basic', 'standard', 'premium'] },
];
export const REGIONS = ['cis', 'europe', 'asia', 'worldwide'] as const;
export const MEDICAL_MONTHS = [1, 3, 6, 12] as const;
export const CAR_MONTHS = [6, 12] as const;
export const MAX_TRAVELERS = 5;
export const MAX_TRIP_DAYS = 90;
export const MAX_START_AHEAD_DAYS = 365;

/** Everything the buy form holds, for any product. Fields a product does not use are simply ignored. */
export type InsuranceForm = {
  product: InsuranceProduct;
  plan: string;
  start?: string;
  end?: string;
  region: string;
  travelers: number;
  months: number;
  plate: string;
  address: string;
};

export const defaultForm = (product: InsuranceProduct): InsuranceForm => ({
  product,
  plan: PRODUCTS.find((p) => p.id === product)?.plans[1] ?? 'basic',
  region: 'europe',
  travelers: 1,
  months: product === 'car' ? 12 : product === 'medical' ? 3 : 12,
  plate: '',
  address: '',
});

/** The request to quote or buy, or null while something the product needs is still missing. Sends only the fields that product uses. */
export function toDetails(f: InsuranceForm): InsuranceDetails | null {
  if (!f.start) return null;
  const base = { product: f.product, plan: f.plan, start_date: f.start };
  switch (f.product) {
    case 'travel':
      return f.end && f.end >= f.start ? { ...base, end_date: f.end, region: f.region, travelers: f.travelers } : null;
    case 'medical':
      return { ...base, months: f.months };
    case 'car':
      return f.plate.replace(/[\s-]/g, '').length >= 4 ? { ...base, months: f.months, plate: f.plate.trim() } : null;
    case 'home':
      return f.address.trim().length >= 5 ? { ...base, address: f.address.trim() } : null;
  }
}

/** Days from `from` to `to` counting both ends, from ISO dates ("2026-11-10" to "2026-11-12" is 3). */
export function inclusiveDays(from: string, to: string): number {
  const ms = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
  return Math.round((ms(to) - ms(from)) / 86_400_000) + 1;
}

/** The ISO date `days` after `iso` (negative goes back). */
export function addDays(iso: string, days: number): string {
  const d = new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)) + days));
  return d.toISOString().slice(0, 10);
}
