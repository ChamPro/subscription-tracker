import type { BillingCycle } from "@/generated/prisma/client";

type BillableSubscription = {
  amount: { toString(): string } | number | string;
  currency: string;
  billingCycle: BillingCycle;
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
