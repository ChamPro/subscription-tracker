import type { BillingCycle } from "@/generated/prisma/client";

type BillableSubscription = {
  amount: { toString(): string } | number | string;
  currency: string;
  billingCycle: BillingCycle;
};

type UpcomingBillSubscription = {
  id: string;
  name: string;
  amount: number;
  currency: string;
  nextBillingDate: string; // ISO string
};

export type UpcomingBill = UpcomingBillSubscription & {
  daysUntil: number;
};

const MONTHLY_FACTOR: Record<BillingCycle, number> = {
  MONTHLY: 1,
  YEARLY: 1 / 12,
  WEEKLY: 52 / 12,
  QUARTERLY: 4 / 12,
};

/**
 * Sum up active subscriptions into a monthly spend total, grouped by currency.
 * Each cycle is normalized to a monthly amount before summing.
 * Returns e.g. { USD: 45.99, CAD: 12.5 } — rounded to 2 decimals.
 */
export function calculateMonthlyTotal(
  subscriptions: BillableSubscription[],
): Record<string, number> {
  const totals: Record<string, number> = {};

  for (const sub of subscriptions) {
    const monthly = Number(sub.amount) * MONTHLY_FACTOR[sub.billingCycle];
    totals[sub.currency] = (totals[sub.currency] ?? 0) + monthly;
  }

  for (const currency of Object.keys(totals)) {
    totals[currency] = Math.round(totals[currency] * 100) / 100;
  }

  return totals;
}

/**
 * Return subscriptions whose nextBillingDate falls between today (local
 * midnight of `now`) and today + `days` days (inclusive), each augmented
 * with `daysUntil: number` (0 = due today). Sorted ascending by daysUntil.
 * Past-due bills (before today's midnight) are excluded.
 */
export function getUpcomingBills(
  subs: UpcomingBillSubscription[],
  days = 7,
  now = new Date(),
): UpcomingBill[] {
  // Compare on the UTC calendar day. nextBillingDate is stored as a UTC-midnight
  // ISO string (Date.toISOString()), so normalizing `now` the same way keeps the
  // comparison correct regardless of the server's local timezone.
  const msPerDay = 24 * 60 * 60 * 1000;
  const todayUtc = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  // End boundary: start of (today + days + 1) — i.e. day `days` is inclusive.
  const endUtc = todayUtc + (days + 1) * msPerDay;

  const result: UpcomingBill[] = [];

  for (const sub of subs) {
    const d = new Date(sub.nextBillingDate);
    const billingUtc = Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate(),
    );

    if (billingUtc >= todayUtc && billingUtc < endUtc) {
      const daysUntil = Math.round((billingUtc - todayUtc) / msPerDay);
      result.push({ ...sub, daysUntil });
    }
  }

  result.sort((a, b) => a.daysUntil - b.daysUntil);
  return result;
}
