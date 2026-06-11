import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { advanceBillingDate } from "@/lib/subscription-utils";
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

  return (
    <EditSubscriptionForm
      subscription={{
        id: sub.id,
        name: sub.name,
        amount: Number(sub.amount),
        currency: sub.currency,
        billingCycle: sub.billingCycle,
        nextBillingDate: advanceBillingDate(
          sub.nextBillingDate.toISOString(),
          sub.billingCycle,
        ).slice(0, 10),
        startDate: sub.startDate.toISOString().slice(0, 10),
        category: sub.category ?? null,
      }}
    />
  );
}
