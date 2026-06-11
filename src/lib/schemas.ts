import { z } from "zod";

export type FormState = {
  errors?: Record<string, string[]>;
};

export const subscriptionSchema = z
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
