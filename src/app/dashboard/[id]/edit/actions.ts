"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { subscriptionSchema, type FormState } from "@/lib/schemas";
import { invalidateUserCache } from "@/lib/redis";

export async function updateSubscription(
  id: string,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const result = subscriptionSchema.safeParse(Object.fromEntries(formData));

  if (!result.success) {
    return { errors: z.flattenError(result.error).fieldErrors };
  }

  await prisma.subscription.updateMany({
    where: { id, userId: session.user.id },
    data: result.data,
  });

  await invalidateUserCache(session.user.id);

  revalidatePath("/dashboard");
  redirect("/dashboard");
}
