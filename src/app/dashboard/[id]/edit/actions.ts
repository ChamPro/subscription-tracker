"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { subscriptionSchema } from "@/lib/schemas";
import { redis, monthlyTotalKey } from '@/lib/redis';

export async function updateSubscription(id: string, formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const parsed = subscriptionSchema.parse(Object.fromEntries(formData));

  await prisma.subscription.updateMany({
    where: { id, userId: session.user.id },
    data: parsed,
  });
  
  try {
    await redis.del(monthlyTotalKey(session.user.id));
  } catch (e) {
    console.error('Redis del failed:', e);
  }

  revalidatePath("/dashboard");
  redirect("/dashboard");
}
