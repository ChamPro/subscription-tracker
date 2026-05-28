"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const schema = z
  .object({
    name: z.string().min(1).max(100),
    amount: z.coerce.number().positive(),
    currency: z.enum(["USD", "CAD"]),
    billingCycle: z.enum(["MONTHLY", "YEARLY", "WEEKLY", "QUARTERLY"]),
    nextBillingDate: z.coerce.date(),
    startDate: z.coerce.date(),
    category: z.string().optional(),
  })
  .refine((data) => data.nextBillingDate >= data.startDate, {
    message: "Next billing date must be on or after start date",
    path: ["nextBillingDate"],
  })
  .refine(
    (data) => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return data.nextBillingDate >= today;
    },
    {
      message: "Next billing date cannot be in the past",
      path: ["nextBillingDate"],
    },
  );

export async function createSubscription(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const parsed = schema.parse(Object.fromEntries(formData));

  await prisma.subscription.create({
    data: {
      ...parsed,
      userId: session.user.id,
    },
  });

  revalidatePath("/dashboard");
  redirect("/dashboard");
}
