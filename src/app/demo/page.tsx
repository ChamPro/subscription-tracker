import Link from "next/link";
import { SubscriptionDashboard } from "@/components/SubscriptionDashboard";
import { getDemoSubscriptions } from "@/lib/demo-data";
import { calculateMonthlyTotal } from "@/lib/subscription-utils";

// Sample dates are relative to "today", so render per-request (not a frozen
// build-time snapshot) to keep Upcoming Bills populated as the deployment ages.
export const dynamic = "force-dynamic";

export default function DemoPage() {
  const subscriptions = getDemoSubscriptions();
  const monthlyTotals = calculateMonthlyTotal(subscriptions);

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 py-12 dark:bg-black">
      <div className="w-full max-w-2xl px-6">
        <div className="mb-8 flex items-center justify-between rounded-lg border border-black/[.08] bg-white px-5 py-4 dark:border-white/[.145] dark:bg-[#0a0a0a]">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Demo mode — you&apos;re viewing sample data. Sign in to track your
            own.
          </p>
          <Link
            href="/login"
            className="ml-4 shrink-0 rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
          >
            Sign in
          </Link>
        </div>

        <SubscriptionDashboard
          subscriptions={subscriptions}
          monthlyTotals={monthlyTotals}
          readOnly
        />
      </div>
    </div>
  );
}
