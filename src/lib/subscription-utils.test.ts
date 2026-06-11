import { describe, it, expect } from "vitest";
import { calculateMonthlyTotal, getUpcomingBills } from "./subscription-utils";

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

describe("getUpcomingBills", () => {
  // Fixed reference point: 2026-06-15 at noon UTC. All dates use a `Z` suffix
  // so the test is timezone-independent and matches the UTC ISO strings the
  // cache actually stores (Date.toISOString()).
  const NOW = new Date("2026-06-15T12:00:00Z");

  const makeSub = (name: string, isoDate: string, amount = 9.99, currency = "USD") => ({
    id: name,
    name,
    amount,
    currency,
    nextBillingDate: isoDate,
  });

  it("returns [] for an empty list", () => {
    expect(getUpcomingBills([], 7, NOW)).toEqual([]);
  });

  it("includes a subscription due today (daysUntil = 0) even when now has a later clock time", () => {
    // Bill is at start of day 2026-06-15; now is 12:00 on same day
    const sub = makeSub("Netflix", "2026-06-15T00:00:00Z");
    const result = getUpcomingBills([sub], 7, NOW);
    expect(result).toHaveLength(1);
    expect(result[0].daysUntil).toBe(0);
    expect(result[0].name).toBe("Netflix");
  });

  it("includes a subscription within the 7-day window", () => {
    const sub = makeSub("Spotify", "2026-06-20T00:00:00Z"); // 5 days later
    const result = getUpcomingBills([sub], 7, NOW);
    expect(result).toHaveLength(1);
    expect(result[0].daysUntil).toBe(5);
  });

  it("includes a subscription on the last day of the window (daysUntil = 7)", () => {
    const sub = makeSub("Hulu", "2026-06-22T00:00:00Z"); // exactly 7 days later
    const result = getUpcomingBills([sub], 7, NOW);
    expect(result).toHaveLength(1);
    expect(result[0].daysUntil).toBe(7);
  });

  it("excludes a subscription beyond the 7-day window", () => {
    const sub = makeSub("Disney+", "2026-06-23T00:00:00Z"); // 8 days later
    const result = getUpcomingBills([sub], 7, NOW);
    expect(result).toHaveLength(0);
  });

  it("excludes a subscription that is already past-due", () => {
    const sub = makeSub("OldService", "2026-06-14T23:59:59Z"); // yesterday
    const result = getUpcomingBills([sub], 7, NOW);
    expect(result).toHaveLength(0);
  });

  it("sorts results ascending by daysUntil", () => {
    const subs = [
      makeSub("C", "2026-06-20T00:00:00Z"), // 5 days
      makeSub("A", "2026-06-15T00:00:00Z"), // 0 days
      makeSub("B", "2026-06-18T00:00:00Z"), // 3 days
    ];
    const result = getUpcomingBills(subs, 7, NOW);
    expect(result.map((s) => s.name)).toEqual(["A", "B", "C"]);
    expect(result.map((s) => s.daysUntil)).toEqual([0, 3, 5]);
  });

  it("supports a custom `days` window", () => {
    const sub3 = makeSub("Short", "2026-06-18T00:00:00Z"); // 3 days
    const sub10 = makeSub("Long", "2026-06-25T00:00:00Z"); // 10 days
    expect(getUpcomingBills([sub3, sub10], 5, NOW)).toHaveLength(1);
    expect(getUpcomingBills([sub3, sub10], 5, NOW)[0].name).toBe("Short");
  });

  it("augments each result with the correct amount and currency", () => {
    const sub = makeSub("Apple TV+", "2026-06-17T00:00:00Z", 15.49, "USD");
    const result = getUpcomingBills([sub], 7, NOW);
    expect(result[0].amount).toBe(15.49);
    expect(result[0].currency).toBe("USD");
  });

  it("handles the exact UTC-midnight ISO shape the cache stores", () => {
    // Date.toISOString() produces millisecond-precision UTC strings.
    const sub = makeSub("Prime", "2026-06-18T00:00:00.000Z");
    const result = getUpcomingBills([sub], 7, NOW);
    expect(result).toHaveLength(1);
    expect(result[0].daysUntil).toBe(3);
  });
});
