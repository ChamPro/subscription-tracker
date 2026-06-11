"use client";

import { useActionState } from "react";
import Link from "next/link";
import { updateSubscription } from "./actions";
import type { FormState } from "@/lib/schemas";

interface Subscription {
  id: string;
  name: string;
  amount: number;
  currency: string;
  billingCycle: string;
  nextBillingDate: string;
  startDate: string;
  category: string | null;
}

interface Props {
  subscription: Subscription;
}

const initialState: FormState = {};

const fieldWrap = "flex flex-col gap-1";
const labelCls = "text-sm font-medium text-black dark:text-zinc-50";
const inputCls =
  "rounded-md border border-black/[.12] bg-white px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-foreground/20 dark:border-white/[.18] dark:bg-[#0a0a0a] dark:text-zinc-50";

export function EditSubscriptionForm({ subscription: sub }: Props) {
  const boundAction = updateSubscription.bind(null, sub.id);
  const [state, formAction, pending] = useActionState(boundAction, initialState);

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 py-12 dark:bg-black">
      <div className="w-full max-w-md px-6">
        <header className="mb-8 flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
            Edit subscription
          </h1>
          <Link
            href="/dashboard"
            className="text-sm text-zinc-600 hover:underline dark:text-zinc-400"
          >
            Cancel
          </Link>
        </header>

        <form action={formAction} className="flex flex-col gap-4">
          <div className={fieldWrap}>
            <label htmlFor="name" className={labelCls}>Name</label>
            <input
              id="name"
              name="name"
              type="text"
              required
              maxLength={100}
              defaultValue={sub.name}
              className={inputCls}
            />
            {state.errors?.name?.map((e) => (
              <p key={e} className="text-sm text-red-600">{e}</p>
            ))}
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
                defaultValue={sub.amount.toString()}
                className={inputCls}
              />
              {state.errors?.amount?.map((e) => (
                <p key={e} className="text-sm text-red-600">{e}</p>
              ))}
            </div>
            <div className={fieldWrap}>
              <label htmlFor="currency" className={labelCls}>Currency</label>
              <select
                id="currency"
                name="currency"
                defaultValue={sub.currency}
                className={inputCls}
              >
                <option value="USD">USD</option>
                <option value="CAD">CAD</option>
              </select>
              {state.errors?.currency?.map((e) => (
                <p key={e} className="text-sm text-red-600">{e}</p>
              ))}
            </div>
          </div>

          <div className={fieldWrap}>
            <label htmlFor="billingCycle" className={labelCls}>Billing cycle</label>
            <select
              id="billingCycle"
              name="billingCycle"
              defaultValue={sub.billingCycle}
              className={inputCls}
            >
              <option value="MONTHLY">Monthly</option>
              <option value="YEARLY">Yearly</option>
              <option value="WEEKLY">Weekly</option>
              <option value="QUARTERLY">Quarterly</option>
            </select>
            {state.errors?.billingCycle?.map((e) => (
              <p key={e} className="text-sm text-red-600">{e}</p>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className={fieldWrap}>
              <label htmlFor="nextBillingDate" className={labelCls}>Next billing date</label>
              <input
                id="nextBillingDate"
                name="nextBillingDate"
                type="date"
                required
                defaultValue={sub.nextBillingDate}
                className={inputCls}
              />
              {state.errors?.nextBillingDate?.map((e) => (
                <p key={e} className="text-sm text-red-600">{e}</p>
              ))}
            </div>
            <div className={fieldWrap}>
              <label htmlFor="startDate" className={labelCls}>Start date</label>
              <input
                id="startDate"
                name="startDate"
                type="date"
                required
                defaultValue={sub.startDate}
                className={inputCls}
              />
              {state.errors?.startDate?.map((e) => (
                <p key={e} className="text-sm text-red-600">{e}</p>
              ))}
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
              defaultValue={sub.category ?? ""}
              className={inputCls}
            />
            {state.errors?.category?.map((e) => (
              <p key={e} className="text-sm text-red-600">{e}</p>
            ))}
          </div>

          <button
            type="submit"
            disabled={pending}
            className="mt-2 rounded-full bg-foreground px-5 py-3 text-sm font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-60 dark:hover:bg-[#ccc]"
          >
            {pending ? "Saving..." : "Save"}
          </button>
        </form>
      </div>
    </div>
  );
}
