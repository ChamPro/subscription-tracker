import type { SerializedSubscription } from "@/lib/queries";

/**
 * Returns realistic demo subscriptions computed relative to the current date
 * so that:
 * - 1-2 subscriptions fall within the next 7 days (Upcoming Bills shows something)
 * - at least 1 has a nextBillingDate a few days IN THE PAST (roll-forward visible)
 * - the rest are spread further out
 */
export function getDemoSubscriptions(): SerializedSubscription[] {
  const now = new Date();

  const utcMidnight = (offsetDays: number): string => {
    const d = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    d.setUTCDate(d.getUTCDate() + offsetDays);
    return d.toISOString();
  };

  // startDate helper — a past date as ISO string
  const pastDate = (daysAgo: number): string => {
    const d = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    d.setUTCDate(d.getUTCDate() - daysAgo);
    return d.toISOString();
  };

  return [
    {
      id: "demo-1",
      name: "Netflix",
      amount: 15.49,
      currency: "USD",
      billingCycle: "MONTHLY",
      // 3 days in the past — roll-forward will advance to next month occurrence
      nextBillingDate: utcMidnight(-3),
      startDate: pastDate(365),
      status: "ACTIVE",
      category: "Entertainment",
    },
    {
      id: "demo-2",
      name: "Spotify",
      amount: 9.99,
      currency: "USD",
      billingCycle: "MONTHLY",
      // Due in 2 days — shows in Upcoming Bills
      nextBillingDate: utcMidnight(2),
      startDate: pastDate(180),
      status: "ACTIVE",
      category: "Entertainment",
    },
    {
      id: "demo-3",
      name: "iCloud+",
      amount: 2.99,
      currency: "USD",
      billingCycle: "MONTHLY",
      // Due in 5 days — shows in Upcoming Bills
      nextBillingDate: utcMidnight(5),
      startDate: pastDate(730),
      status: "ACTIVE",
      category: "Storage",
    },
    {
      id: "demo-4",
      name: "Amazon Prime",
      amount: 139.0,
      currency: "USD",
      billingCycle: "YEARLY",
      // Due in 18 days — outside 7-day window
      nextBillingDate: utcMidnight(18),
      startDate: pastDate(400),
      status: "ACTIVE",
      category: "Shopping",
    },
    {
      id: "demo-5",
      name: "ChatGPT Plus",
      amount: 20.0,
      currency: "USD",
      billingCycle: "MONTHLY",
      // Due in 12 days
      nextBillingDate: utcMidnight(12),
      startDate: pastDate(90),
      status: "ACTIVE",
      category: "Productivity",
    },
    {
      id: "demo-6",
      name: "Gym Membership",
      amount: 49.99,
      currency: "USD",
      billingCycle: "MONTHLY",
      // Due in 22 days
      nextBillingDate: utcMidnight(22),
      startDate: pastDate(200),
      status: "ACTIVE",
      category: "Health",
    },
    {
      id: "demo-7",
      name: "GitHub Copilot",
      amount: 10.0,
      currency: "USD",
      billingCycle: "MONTHLY",
      // Due in 28 days
      nextBillingDate: utcMidnight(28),
      startDate: pastDate(60),
      status: "ACTIVE",
      category: "Productivity",
    },
  ];
}
