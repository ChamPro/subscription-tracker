import { describe, it, expect } from "vitest";
import { calculateMonthlyTotal } from "./subscription-utils";

describe("calculateMonthlyTotal", () => {
  it("handles MONTHLY only", () => {
    const result = calculateMonthlyTotal([
      { amount: 10, currency: "USD", billingCycle: "MONTHLY" },
      { amount: 5.5, currency: "USD", billingCycle: "MONTHLY" },
    ]);
    expect(result).toEqual({ USD: 15.5 });
  });

  it("divides YEARLY by 12", () => {
    const result = calculateMonthlyTotal([
      { amount: 120, currency: "USD", billingCycle: "YEARLY" },
    ]);
    expect(result).toEqual({ USD: 10 });
  });

  it("handles mixed billing cycles", () => {
    // MONTHLY 10 + YEARLY 120/12=10 + WEEKLY 10*52/12=43.33 + QUARTERLY 30*4/12=10
    const result = calculateMonthlyTotal([
      { amount: 10, currency: "USD", billingCycle: "MONTHLY" },
      { amount: 120, currency: "USD", billingCycle: "YEARLY" },
      { amount: 10, currency: "USD", billingCycle: "WEEKLY" },
      { amount: 30, currency: "USD", billingCycle: "QUARTERLY" },
    ]);
    expect(result).toEqual({ USD: 73.33 });
  });

  it("groups by currency", () => {
    const result = calculateMonthlyTotal([
      { amount: 45.99, currency: "USD", billingCycle: "MONTHLY" },
      { amount: 12.5, currency: "CAD", billingCycle: "MONTHLY" },
    ]);
    expect(result).toEqual({ USD: 45.99, CAD: 12.5 });
  });

  it("returns {} for an empty array", () => {
    expect(calculateMonthlyTotal([])).toEqual({});
  });

  it("avoids floating point drift (9.99 x 3 = 29.97)", () => {
    const result = calculateMonthlyTotal([
      { amount: 9.99, currency: "USD", billingCycle: "MONTHLY" },
      { amount: 9.99, currency: "USD", billingCycle: "MONTHLY" },
      { amount: 9.99, currency: "USD", billingCycle: "MONTHLY" },
    ]);
    expect(result).toEqual({ USD: 29.97 });
  });

  it("converts Prisma Decimal-like amounts via Number()", () => {
    const result = calculateMonthlyTotal([
      { amount: { toString: () => "15.00" }, currency: "USD", billingCycle: "MONTHLY" },
    ]);
    expect(result).toEqual({ USD: 15 });
  });
});
