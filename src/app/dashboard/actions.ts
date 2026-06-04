"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { invalidateUserCache } from '@/lib/redis';

export async function deleteSubscription(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const id = formData.get("id");
  if (typeof id !== "string" || !id) {
    throw new Error("Invalid id");
  }

  await prisma.subscription.deleteMany({
    where: { id, userId: session.user.id },
  });
  
  await invalidateUserCache(session.user.id);

  revalidatePath("/dashboard");
}
