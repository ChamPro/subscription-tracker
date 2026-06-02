import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deleteSubscription } from "./actions";

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const subscriptions = await prisma.subscription.findMany({
    where: { userId: session.user.id, status: "ACTIVE" },
    orderBy: { nextBillingDate: "asc" },
  });

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

        {subscriptions.length === 0 ? (
          <p className="text-zinc-500 dark:text-zinc-400">
            No active subscriptions yet
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {subscriptions.map((sub) => (
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
                    {sub.nextBillingDate.toLocaleDateString()}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/dashboard/${sub.id}/edit`}
                    className="rounded-full border border-solid border-black/[.08] px-3 py-1.5 text-sm transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
                  >
                    Edit
                  </Link>
                  <form action={deleteSubscription}>
                    <input type="hidden" name="id" value={sub.id} />
                    <button
                      type="submit"
                      className="rounded-full border border-solid border-black/[.08] px-3 py-1.5 text-sm transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
                    >
                      Delete
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
