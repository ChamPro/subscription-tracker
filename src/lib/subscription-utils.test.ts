import { describe, it, expect, afterEach, vi } from "vitest";
import {
  calculateMonthlyTotal,
  getUpcomingBills,
  advanceBillingDate,
  isUsableDate,
  formatCalendarDate,
} from "./subscription-utils";

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

describe("advanceBillingDate", () => {
  // Fixed reference point: 2026-06-15 at noon UTC (same convention as getUpcomingBills tests).
  const NOW = new Date("2026-06-15T12:00:00Z");

  it("returns the date unchanged when it is in the future", () => {
    const future = "2026-06-20T00:00:00Z";
    expect(advanceBillingDate(future, "MONTHLY", NOW)).toBe(future);
  });

  it("returns the date unchanged when it is exactly today (UTC day)", () => {
    const today = "2026-06-15T00:00:00Z";
    expect(advanceBillingDate(today, "MONTHLY", NOW)).toBe(today);
  });

  it("advances one MONTHLY step when the date is one month in the past", () => {
    // 2026-05-15 is past; one MONTHLY step → 2026-06-15 (today → unchanged)
    const past = "2026-05-15T00:00:00Z";
    const result = advanceBillingDate(past, "MONTHLY", NOW);
    const d = new Date(result);
    // 2026-06-15 UTC
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(5); // June (0-indexed)
    expect(d.getUTCDate()).toBe(15);
  });

  it("advances multiple MONTHLY steps when the date is several months in the past", () => {
    // 2026-01-10 is ~5 months in the past; should land on 2026-07-10
    const past = "2026-01-10T00:00:00Z";
    const result = advanceBillingDate(past, "MONTHLY", NOW);
    const d = new Date(result);
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(6); // July
    expect(d.getUTCDate()).toBe(10);
  });

  it("advances WEEKLY by 7-day steps until >= today", () => {
    // 2026-06-08 is 7 days ago; one +7 step → 2026-06-15 (today → ok)
    const past = "2026-06-08T00:00:00Z";
    const result = advanceBillingDate(past, "WEEKLY", NOW);
    const d = new Date(result);
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(5);
    expect(d.getUTCDate()).toBe(15);
  });

  it("advances QUARTERLY by 3-month steps until >= today", () => {
    // 2026-03-10 is ~3 months ago; one QUARTERLY step → 2026-06-10 (still past today 15th, so another step → 2026-09-10)
    const past = "2025-12-10T00:00:00Z";
    const result = advanceBillingDate(past, "QUARTERLY", NOW);
    const d = new Date(result);
    // From 2025-12-10: +3m → 2026-03-10 (still past), +3m → 2026-06-10 (still past 15), +3m → 2026-09-10
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(8); // September
    expect(d.getUTCDate()).toBe(10);
  });

  it("advances YEARLY by 1-year steps until >= today", () => {
    // 2025-06-10 is past; one YEARLY step → 2026-06-10 (still past day 15), another → 2027-06-10
    const past = "2024-06-10T00:00:00Z";
    const result = advanceBillingDate(past, "YEARLY", NOW);
    const d = new Date(result);
    // 2024-06-10 → 2025-06-10 (past) → 2026-06-10 (past day 15) → 2027-06-10
    expect(d.getUTCFullYear()).toBe(2027);
    expect(d.getUTCMonth()).toBe(5); // June
    expect(d.getUTCDate()).toBe(10);
  });

  it("clamps a month-end day to the target month (Jan 31 -> Feb 28, not Mar 3)", () => {
    const result = advanceBillingDate(
      "2026-01-31T00:00:00Z",
      "MONTHLY",
      new Date("2026-02-01T12:00:00Z"),
    );
    const d = new Date(result);
    expect(d.getUTCMonth()).toBe(1); // February
    expect(d.getUTCDate()).toBe(28); // clamped, not drifted to March 3
  });

  it("restores the original anchor day after a short month (Jan 31 -> Mar 31)", () => {
    const result = advanceBillingDate(
      "2026-01-31T00:00:00Z",
      "MONTHLY",
      new Date("2026-03-01T12:00:00Z"),
    );
    const d = new Date(result);
    expect(d.getUTCMonth()).toBe(2); // March
    expect(d.getUTCDate()).toBe(31); // anchor day restored — no cumulative drift
  });

  it("clamps YEARLY Feb 29 into a non-leap year (-> Feb 28)", () => {
    const result = advanceBillingDate(
      "2024-02-29T00:00:00Z",
      "YEARLY",
      new Date("2025-01-01T12:00:00Z"),
    );
    const d = new Date(result);
    expect(d.getUTCFullYear()).toBe(2025);
    expect(d.getUTCMonth()).toBe(1); // February
    expect(d.getUTCDate()).toBe(28);
  });

  it("clamps QUARTERLY across a shorter month (Aug 31 -> Nov 30)", () => {
    const result = advanceBillingDate(
      "2026-08-31T00:00:00Z",
      "QUARTERLY",
      new Date("2026-10-01T12:00:00Z"),
    );
    const d = new Date(result);
    expect(d.getUTCMonth()).toBe(10); // November
    expect(d.getUTCDate()).toBe(30); // clamped from 31
  });

  it("returns the input unchanged for an unparseable date", () => {
    expect(advanceBillingDate("not-a-date", "MONTHLY", NOW)).toBe("not-a-date");
  });
});

describe("isUsableDate", () => {
  it("accepts a normal Date", () => {
    expect(isUsableDate(new Date("2026-09-02T00:00:00.000Z"))).toBe(true);
  });

  it("rejects a Date whose time is NaN", () => {
    // What the database driver hands back when it cannot parse the stored
    // timestamp — the exact value that used to crash the dashboard. It is a
    // real Date instance, so `instanceof` alone would let it through.
    const invalid = new Date("202609-02-05T05:00:00+00:00");

    expect(invalid).toBeInstanceOf(Date);
    expect(Number.isNaN(invalid.getTime())).toBe(true);
    expect(isUsableDate(invalid)).toBe(false);
  });

  it("rejects non-Date values", () => {
    for (const value of [null, undefined, "2026-09-02", 0, {}, NaN]) {
      expect(isUsableDate(value)).toBe(false);
    }
  });

  it("narrows the type, so .toISOString() is safe behind the guard", () => {
    const value: unknown = new Date("2026-09-02T00:00:00.000Z");

    expect(isUsableDate(value) && value.toISOString()).toBe(
      "2026-09-02T00:00:00.000Z",
    );
  });
});

describe("formatCalendarDate", () => {
  // Timezones are set explicitly rather than inherited from the machine running
  // the tests, so this suite behaves the same on a laptop in EDT and on a CI
  // runner in UTC. Node re-reads process.env.TZ per Date operation.
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function withTz(tz: string, fn: () => void) {
    vi.stubEnv("TZ", tz);
    fn();
  }

  // Midnight UTC — how every calendar date in this app is stored. This is the
  // instant that rolls backwards a day when rendered west of UTC.
  const SEP_4 = "2026-09-04T00:00:00.000Z";

  const WESTERN_ZONES = [
    "America/New_York", // UTC-4 in September
    "America/Los_Angeles", // UTC-7
    "Pacific/Honolulu", // UTC-10
    "Pacific/Niue", // UTC-11, the furthest west
  ];

  it.each(WESTERN_ZONES)(
    "keeps the stored day intact in %s (no roll-back)",
    (tz) => {
      withTz(tz, () => {
        expect(formatCalendarDate(SEP_4, "en-CA")).toBe("2026-09-04");
      });
    },
  );

  it.each(["UTC", "Europe/Berlin", "Asia/Tokyo", "Pacific/Kiritimati"])(
    "renders the same day in %s",
    (tz) => {
      withTz(tz, () => {
        expect(formatCalendarDate(SEP_4, "en-CA")).toBe("2026-09-04");
      });
    },
  );

  it("is the fix for a bug that the local-timezone version really has", () => {
    // Guards the guard: if the naive call ever stopped rolling the day back,
    // the assertions above would pass for the wrong reason.
    withTz("America/New_York", () => {
      expect(new Date(SEP_4).toLocaleDateString("en-CA")).toBe("2026-09-03");
      expect(formatCalendarDate(SEP_4, "en-CA")).toBe("2026-09-04");
    });
  });

  it("agrees with the ISO string's own date part, whatever the zone", () => {
    for (const tz of [...WESTERN_ZONES, "UTC", "Asia/Tokyo"]) {
      withTz(tz, () => {
        for (const iso of [
          "2026-01-01T00:00:00.000Z",
          "2026-09-04T00:00:00.000Z",
          "2026-12-31T00:00:00.000Z", // year boundary — would roll to 2025 west of UTC
          "2028-02-29T00:00:00.000Z", // leap day — would roll to Feb 28
        ]) {
          expect(formatCalendarDate(iso, "en-CA")).toBe(iso.slice(0, 10));
        }
      });
    }
  });

  it("honours the requested locale while keeping the zone pinned", () => {
    withTz("America/Los_Angeles", () => {
      expect(formatCalendarDate(SEP_4, "en-US")).toBe("9/4/2026");
      expect(formatCalendarDate(SEP_4, "de-DE")).toBe("4.9.2026");
    });
  });
});
