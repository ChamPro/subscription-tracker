import type { BillingCycle } from "@/generated/prisma/client";

/**
 * True when a Date that came from outside the app is actually usable.
 *
 * A date read back from the database is typed as `Date` but is not guaranteed
 * to be a valid one. The driver builds it by parsing a string, and when that
 * parse fails it hands back a Date whose time is NaN instead of throwing — so
 * the bad value flows through unnoticed until something calls .toISOString()
 * on it and gets a RangeError. Anything that serializes or renders a stored
 * date checks it here first, the same way we never assume Redis is reachable.
 */
export function isUsableDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

/**
 * Advance a subscription's nextBillingDate forward by its billing cycle until
 * the UTC day is >= today's UTC day. If the date is already today or in the
 * future, it is returned unchanged. Input and output are UTC ISO strings.
 *
 * Uses the same UTC-day comparison style as getUpcomingBills.
 */
export function advanceBillingDate(
  nextBillingDate: string,
  billingCycle: BillingCycle,
  now = new Date(),
): string {
  const d = new Date(nextBillingDate);
  // Guard against an unparseable input (NaN never satisfies the loop exit).
  if (Number.isNaN(d.getTime())) {
    return nextBillingDate;
  }

  const dayUtc = (date: Date) =>
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const todayUtc = dayUtc(now);

  // Already today or in the future — return the input unchanged.
  if (dayUtc(d) >= todayUtc) {
    return nextBillingDate;
  }

  // WEEKLY: plain +7-day stepping — no month-length subtleties.
  if (billingCycle === "WEEKLY") {
    let cur = d;
    while (dayUtc(cur) < todayUtc) {
      cur = new Date(cur.getTime() + 7 * 24 * 60 * 60 * 1000);
    }
    return cur.toISOString();
  }

  // Month-based cycles: always recompute from the ORIGINAL anchor day and clamp
  // to the target month's length, so a bill on the 31st becomes Feb 28 → Mar 31
  // (no cumulative drift to the 3rd that would otherwise persist on edit/save).
  const stepMonths =
    billingCycle === "QUARTERLY" ? 3 : billingCycle === "YEARLY" ? 12 : 1;
  const anchorDay = d.getUTCDate();
  const startYear = d.getUTCFullYear();
  const startMonth = d.getUTCMonth();

  const daysInMonth = (y: number, m: number) =>
    new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

  for (let step = 1; ; step++) {
    const totalMonths = startMonth + step * stepMonths;
    const y = startYear + Math.floor(totalMonths / 12);
    const m = ((totalMonths % 12) + 12) % 12;
    const day = Math.min(anchorDay, daysInMonth(y, m));
    const candidate = new Date(Date.UTC(y, m, day));
    if (dayUtc(candidate) >= todayUtc) {
      return candidate.toISOString();
    }
  }
}

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
