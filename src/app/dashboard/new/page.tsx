import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { createSubscription } from "./actions";

export default async function NewSubscriptionPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const today = new Date().toISOString().slice(0, 10);

  const fieldWrap = "flex flex-col gap-1";
  const labelCls = "text-sm font-medium text-black dark:text-zinc-50";
  const inputCls =
    "rounded-md border border-black/[.12] bg-white px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-foreground/20 dark:border-white/[.18] dark:bg-[#0a0a0a] dark:text-zinc-50";

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 py-12 dark:bg-black">
      <div className="w-full max-w-md px-6">
        <header className="mb-8 flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
            Add subscription
          </h1>
          <Link
            href="/dashboard"
            className="text-sm text-zinc-600 hover:underline dark:text-zinc-400"
          >
            Cancel
          </Link>
        </header>

        <form action={createSubscription} className="flex flex-col gap-4">
          <div className={fieldWrap}>
            <label htmlFor="name" className={labelCls}>Name</label>
            <input
              id="name"
              name="name"
              type="text"
              required
              maxLength={100}
              className={inputCls}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className={fieldWrap}>
              <label htmlFor="amount" className={labelCls}>Amount</label>
              <input
                id="amount"
                name="amount"
                type="number"
                step="0.01"
                min="0.01"
                required
                className={inputCls}
              />
            </div>
            <div className={fieldWrap}>
              <label htmlFor="currency" className={labelCls}>Currency</label>
              <select
                id="currency"
                name="currency"
                defaultValue="USD"
                className={inputCls}
              >
                <option value="USD">USD</option>
                <option value="CAD">CAD</option>
              </select>
            </div>
          </div>

          <div className={fieldWrap}>
            <label htmlFor="billingCycle" className={labelCls}>Billing cycle</label>
            <select
              id="billingCycle"
              name="billingCycle"
              defaultValue="MONTHLY"
              className={inputCls}
            >
              <option value="MONTHLY">Monthly</option>
              <option value="YEARLY">Yearly</option>
              <option value="WEEKLY">Weekly</option>
              <option value="QUARTERLY">Quarterly</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className={fieldWrap}>
              <label htmlFor="nextBillingDate" className={labelCls}>Next billing date</label>
              <input
                id="nextBillingDate"
                name="nextBillingDate"
                type="date"
                required
                min={today}
                className={inputCls}
              />
            </div>
            <div className={fieldWrap}>
              <label htmlFor="startDate" className={labelCls}>Start date</label>
              <input
                id="startDate"
                name="startDate"
                type="date"
                required
                defaultValue={today}
                className={inputCls}
              />
            </div>
          </div>

          <div className={fieldWrap}>
            <label htmlFor="category" className={labelCls}>
              Category <span className="text-zinc-500">(optional)</span>
            </label>
            <input
              id="category"
              name="category"
              type="text"
              className={inputCls}
            />
          </div>

          <button
            type="submit"
            className="mt-2 rounded-full bg-foreground px-5 py-3 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
          >
            Create
          </button>
        </form>
      </div>
    </div>
  );
}
