import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";
import { getCachedMonthlyTotal, getCachedSubscriptions } from "@/lib/queries";
import { advanceBillingDate, getUpcomingBills } from "@/lib/subscription-utils";
import { DeleteButton } from "./DeleteButton";

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const subscriptions = await getCachedSubscriptions(session.user.id);

  // Derive a display list with billing dates rolled forward to the next
  // future occurrence. Used for both the list rows and Upcoming Bills.
  // Re-sort by the rolled-forward date so rows stay in next-billing order.
  const displaySubscriptions = subscriptions
    .map((sub) => ({
      ...sub,
      nextBillingDate: advanceBillingDate(sub.nextBillingDate, sub.billingCycle),
    }))
    .sort((a, b) => a.nextBillingDate.localeCompare(b.nextBillingDate));

  const monthlyTotals = await getCachedMonthlyTotal(session.user.id);
  const totalEntries = Object.entries(monthlyTotals);

  const upcomingBills = getUpcomingBills(displaySubscriptions);

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 py-12 dark:bg-black">
      <div className="w-full max-w-2xl px-6">
        <header className="mb-8 flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
            Hello, {session.user.name}
          </h1>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}
          >
            <button
              type="submit"
              className="rounded-full border border-solid border-black/[.08] px-4 py-2 text-sm transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
            >
              Sign out
            </button>
          </form>
        </header>

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
          <Link
            href="/dashboard/new"
            className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
          >
            + Add Subscription
          </Link>
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
                    {new Date(sub.nextBillingDate).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/dashboard/${sub.id}/edit`}
                    className="rounded-full border border-solid border-black/[.08] px-3 py-1.5 text-sm transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
                  >
                    Edit
                  </Link>
                  <DeleteButton id={sub.id} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
