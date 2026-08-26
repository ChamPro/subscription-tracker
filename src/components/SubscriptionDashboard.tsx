import Link from "next/link";
import type { SerializedSubscription } from "@/lib/queries";
import {
  advanceBillingDate,
  formatCalendarDate,
  getUpcomingBills,
} from "@/lib/subscription-utils";
import { DeleteButton } from "@/app/dashboard/DeleteButton";

interface Props {
  subscriptions: SerializedSubscription[];
  monthlyTotals: Record<string, number>;
  readOnly?: boolean;
}

export function SubscriptionDashboard({
  subscriptions,
  monthlyTotals,
  readOnly = false,
}: Props) {
  const displaySubscriptions = subscriptions
    .map((sub) => ({
      ...sub,
      nextBillingDate: advanceBillingDate(sub.nextBillingDate, sub.billingCycle),
    }))
    .sort((a, b) => a.nextBillingDate.localeCompare(b.nextBillingDate));

  const totalEntries = Object.entries(monthlyTotals);
  const upcomingBills = getUpcomingBills(displaySubscriptions);

  return (
    <>
      <div className="mb-8 rounded-lg border border-black/[.08] bg-white px-5 py-4 dark:border-white/[.145] dark:bg-[#0a0a0a]">
        <h2 className="mb-2 text-sm font-medium text-zinc-600 dark:text-zinc-400">
          Monthly Total
        </h2>
        {totalEntries.length === 0 ? (
          <p className="text-zinc-500 dark:text-zinc-400">
            No active subscriptions
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            {totalEntries.map(([currency, total]) => (
              <p
                key={currency}
                className="text-2xl font-semibold text-black dark:text-zinc-50"
              >
                {total.toFixed(2)} {currency}
              </p>
            ))}
          </div>
        )}
      </div>

      <div className="mb-8 rounded-lg border border-black/[.08] bg-white px-5 py-4 dark:border-white/[.145] dark:bg-[#0a0a0a]">
        <h2 className="mb-2 text-sm font-medium text-zinc-600 dark:text-zinc-400">
          Upcoming Bills
        </h2>
        {upcomingBills.length === 0 ? (
          <p className="text-zinc-500 dark:text-zinc-400">
            No upcoming bills in the next 7 days
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            {upcomingBills.map((bill) => {
              const dueText =
                bill.daysUntil === 0
                  ? "due today"
                  : bill.daysUntil === 1
                    ? "in 1 day"
                    : `in ${bill.daysUntil} days`;
              return (
                <p
                  key={bill.id}
                  className="text-sm text-black dark:text-zinc-50"
                >
                  {bill.name} — {bill.amount.toFixed(2)} {bill.currency} —{" "}
                  {dueText}
                </p>
              );
            })}
          </div>
        )}
      </div>

      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-lg font-medium text-black dark:text-zinc-50">
          Active subscriptions
        </h2>
        {!readOnly && (
          <Link
            href="/dashboard/new"
            className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
          >
            + Add Subscription
          </Link>
        )}
      </div>

      {displaySubscriptions.length === 0 ? (
        <p className="text-zinc-500 dark:text-zinc-400">
          No active subscriptions yet
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {displaySubscriptions.map((sub) => (
            <li
              key={sub.id}
              className="flex items-center justify-between rounded-lg border border-black/[.08] bg-white px-4 py-3 dark:border-white/[.145] dark:bg-[#0a0a0a]"
            >
              <div className="flex flex-col gap-1">
                <span className="font-medium text-black dark:text-zinc-50">
                  {sub.name}
                </span>
                <span className="text-sm text-zinc-600 dark:text-zinc-400">
                  {sub.amount.toFixed(2)} {sub.currency} ·{" "}
                  {sub.billingCycle.toLowerCase()} · next{" "}
                  {formatCalendarDate(sub.nextBillingDate)}
                </span>
              </div>
              {!readOnly && (
                <div className="flex items-center gap-2">
                  <Link
                    href={`/dashboard/${sub.id}/edit`}
                    className="rounded-full border border-solid border-black/[.08] px-3 py-1.5 text-sm transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
                  >
                    Edit
                  </Link>
                  <DeleteButton id={sub.id} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
