import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";
import { getCachedMonthlyTotal, getCachedSubscriptions } from "@/lib/queries";
import { SubscriptionDashboard } from "@/components/SubscriptionDashboard";

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/");
  }

  const subscriptions = await getCachedSubscriptions(session.user.id);

  const monthlyTotals = await getCachedMonthlyTotal(session.user.id);
  const totalEntries = Object.entries(monthlyTotals);

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

        <SubscriptionDashboard
          subscriptions={subscriptions}
          monthlyTotals={Object.fromEntries(totalEntries)}
        />
      </div>
    </div>
  );
}
