import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { advanceBillingDate, isUsableDate } from "@/lib/subscription-utils";
import { EditSubscriptionForm } from "./EditSubscriptionForm";

export default async function EditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user) {
    redirect("/");
  }

  const sub = await prisma.subscription.findFirst({
    where: { id, userId: session.user.id },
  });

  if (!sub) {
    notFound();
  }

  // A stored date can come back unusable (see isUsableDate). This page is the
  // only way to repair such a row, so it must not be the page that crashes on
  // it: the broken field renders empty and the user picks a valid date. The
  // input is `required`, so the form cannot be saved until they do. Deliberately
  // not pre-filled with today — that would silently invent data and read as if
  // the date had always been correct.
  const nextBillingDate = isUsableDate(sub.nextBillingDate)
    ? advanceBillingDate(
        sub.nextBillingDate.toISOString(),
        sub.billingCycle,
      ).slice(0, 10)
    : "";
  const startDate = isUsableDate(sub.startDate)
    ? sub.startDate.toISOString().slice(0, 10)
    : "";

  return (
    <EditSubscriptionForm
      subscription={{
        id: sub.id,
        name: sub.name,
        amount: Number(sub.amount),
        currency: sub.currency,
        billingCycle: sub.billingCycle,
        nextBillingDate,
        startDate,
        category: sub.category ?? null,
      }}
    />
  );
}
