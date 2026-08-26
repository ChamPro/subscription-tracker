import { z } from "zod";
import { describe, it, expect } from "vitest";
import { calendarDate, subscriptionSchema } from "@/lib/schemas";

/** Format a Date as the YYYY-MM-DD string an <input type="date"> would submit. */
function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Midnight UTC today — the same reference the schema uses. */
function utcToday(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

function shiftYears(date: Date, years: number): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear() + years, date.getUTCMonth(), date.getUTCDate()),
  );
}

function shiftDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

const TODAY = utcToday();
const MAX_ALLOWED = shiftYears(TODAY, 50);

/** The single message a rejected date produced (asserts exactly one issue). */
function rejectionMessage(input: unknown): string {
  const result = calendarDate.safeParse(input);
  expect(result.success).toBe(false);
  if (result.success) throw new Error("unreachable");
  expect(result.error.issues).toHaveLength(1);
  return result.error.issues[0].message;
}

describe("calendarDate", () => {
  describe("accepts", () => {
    it("a normal YYYY-MM-DD, parsed as midnight UTC", () => {
      const result = calendarDate.parse("2026-09-02");

      expect(result).toBeInstanceOf(Date);
      expect(result.toISOString()).toBe("2026-09-02T00:00:00.000Z");
    });

    it("a leap day that really exists", () => {
      expect(calendarDate.parse("2028-02-29").toISOString()).toBe(
        "2028-02-29T00:00:00.000Z",
      );
    });

    it("surrounding whitespace (trimmed before parsing)", () => {
      expect(calendarDate.parse("  2026-09-02  ").toISOString()).toBe(
        "2026-09-02T00:00:00.000Z",
      );
    });

    it("is timezone-independent — never the local-midnight interpretation", () => {
      // new Date("2026-09-02") is UTC by spec, but the legacy parser this
      // replaces treated non-ISO input as local time. Pin the UTC result.
      const parsed = calendarDate.parse("2026-09-02");

      expect(parsed.getUTCHours()).toBe(0);
      expect(parsed.getUTCFullYear()).toBe(2026);
      expect(parsed.getUTCMonth()).toBe(8); // September, 0-based
      expect(parsed.getUTCDate()).toBe(2);
    });
  });

  describe("rejects out-of-format input", () => {
    it("the six-digit year that took the dashboard down", () => {
      // Regression: "202609-02-05" passed z.coerce.date() via JS's legacy
      // parser, stored fine, then read back as an Invalid Date.
      expect(rejectionMessage("202609-02-05")).toBe("Please enter a valid date");
    });

    it("a five-digit year", () => {
      expect(rejectionMessage("99999-01-01")).toBe("Please enter a valid date");
    });

    it("free text", () => {
      expect(rejectionMessage("not-a-date")).toBe("Please enter a valid date");
    });

    it("an empty string", () => {
      expect(rejectionMessage("")).toBe("Please enter a valid date");
    });

    it("a signed extended year, even though JS itself accepts it", () => {
      expect(rejectionMessage("+002026-09-02")).toBe(
        "Please enter a valid date",
      );
    });

    it("a full ISO timestamp — the form only ever submits a plain date", () => {
      expect(rejectionMessage("2026-09-02T00:00:00.000Z")).toBe(
        "Please enter a valid date",
      );
    });

    it("unpadded components", () => {
      expect(rejectionMessage("2026-9-2")).toBe("Please enter a valid date");
    });

    it("a non-string", () => {
      expect(rejectionMessage(20260902)).toBe("Please enter a valid date");
    });
  });

  describe("rejects dates that do not exist", () => {
    it("February 31st, instead of silently rolling it to March 3rd", () => {
      expect(rejectionMessage("2026-02-31")).toBe("That date doesn't exist");
    });

    it("February 29th in a non-leap year", () => {
      expect(rejectionMessage("2026-02-29")).toBe("That date doesn't exist");
    });

    it("month 13", () => {
      expect(rejectionMessage("2026-13-01")).toBe("That date doesn't exist");
    });

    it("month 00", () => {
      expect(rejectionMessage("2026-00-10")).toBe("That date doesn't exist");
    });

    it("day 00", () => {
      expect(rejectionMessage("2026-09-00")).toBe("That date doesn't exist");
    });

    it("a two-digit year, which Date.UTC would map into the 1900s", () => {
      // Date.UTC(26, 0, 1) is 1926-01-01, not 0026-01-01.
      expect(rejectionMessage("0026-01-01")).toBe("That date doesn't exist");
    });
  });

  describe("business bounds", () => {
    it("accepts the earliest allowed date, 1970-01-01", () => {
      expect(calendarDate.parse("1970-01-01").toISOString()).toBe(
        "1970-01-01T00:00:00.000Z",
      );
    });

    it("rejects the day before it", () => {
      expect(rejectionMessage("1969-12-31")).toBe(
        "Date must be on or after January 1, 1970",
      );
    });

    it("accepts exactly today + 50 years", () => {
      expect(calendarDate.parse(iso(MAX_ALLOWED)).toISOString()).toBe(
        MAX_ALLOWED.toISOString(),
      );
    });

    it("rejects one day past today + 50 years", () => {
      expect(rejectionMessage(iso(shiftDays(MAX_ALLOWED, 1)))).toBe(
        "Year looks incorrect",
      );
    });

    it("rejects the largest four-digit year", () => {
      expect(rejectionMessage("9999-12-31")).toBe("Year looks incorrect");
    });
  });

  it("always yields a Date that survives the round-trip that used to crash", () => {
    // The original bug was a Date object whose getTime() was NaN, so
    // .toISOString() threw. Every accepted value must be safe to serialize.
    for (const input of ["1970-01-01", "2026-09-02", "2028-02-29", iso(MAX_ALLOWED)]) {
      const parsed = calendarDate.parse(input);

      expect(Number.isNaN(parsed.getTime())).toBe(false);
      expect(() => parsed.toISOString()).not.toThrow();
      expect(new Date(parsed.toISOString()).getTime()).toBe(parsed.getTime());
    }
  });
});

describe("subscriptionSchema", () => {
  // Relative to today so the fixture can never drift out of the +50y window
  // the way a hard-coded far-future date would.
  const NEXT_YEAR = iso(shiftYears(TODAY, 1));

  function form(overrides: Record<string, unknown> = {}) {
    return {
      name: "Netflix",
      amount: "10",
      currency: "USD",
      billingCycle: "MONTHLY",
      nextBillingDate: NEXT_YEAR,
      startDate: "2020-01-01",
      ...overrides,
    };
  }

  it("accepts a valid submission and hands Prisma real Dates", () => {
    const result = subscriptionSchema.parse(form());

    expect(result.nextBillingDate.toISOString()).toBe(`${NEXT_YEAR}T00:00:00.000Z`);
    expect(result.startDate.toISOString()).toBe("2020-01-01T00:00:00.000Z");
  });

  it("rejects the six-digit year on nextBillingDate, keyed to that field", () => {
    const result = subscriptionSchema.safeParse(
      form({ nextBillingDate: "202609-02-05" }),
    );

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(z.flattenError(result.error).fieldErrors.nextBillingDate).toEqual([
      "Please enter a valid date",
    ]);
  });

  it("applies the same rules to startDate", () => {
    const result = subscriptionSchema.safeParse(
      form({ startDate: "99999-01-01" }),
    );

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(z.flattenError(result.error).fieldErrors.startDate).toEqual([
      "Please enter a valid date",
    ]);
  });

  describe("cross-field rules still apply", () => {
    it("rejects nextBillingDate before startDate", () => {
      const result = subscriptionSchema.safeParse(
        form({ nextBillingDate: iso(TODAY), startDate: iso(shiftDays(TODAY, 1)) }),
      );

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(
        z.flattenError(result.error).fieldErrors.nextBillingDate,
      ).toContain("Next billing date must be on or after start date");
    });

    it("rejects a nextBillingDate in the past", () => {
      const result = subscriptionSchema.safeParse(
        form({ nextBillingDate: iso(shiftDays(TODAY, -1)) }),
      );

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(
        z.flattenError(result.error).fieldErrors.nextBillingDate,
      ).toContain("Next billing date cannot be in the past");
    });

    it("accepts today itself — the boundary is midnight UTC, not local", () => {
      // Previously this failed for anyone west of UTC: z.coerce.date() built
      // the date at midnight UTC but compared it against local midnight.
      const result = subscriptionSchema.safeParse(
        form({ nextBillingDate: iso(TODAY) }),
      );

      expect(result.success).toBe(true);
    });
  });
});
