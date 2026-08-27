import { z } from "zod";

export type FormState = {
  errors?: Record<string, string[]>;
};

// --- Calendar dates --------------------------------------------------------
//
// Date strings are deliberately NOT handed to `new Date()` / `z.coerce.date()`.
// JavaScript has two date parsers: a strict ISO 8601 one and a lenient legacy
// fallback. The fallback accepts input that no downstream consumer can read
// back. A six-digit year such as "202609-02-05" parses fine on the way in,
// stores fine in Postgres, and then comes back out as an Invalid Date — ISO
// 8601 requires a `+`/`-` sign on years longer than four digits, and the
// database driver does not add one. The result is a value that can be written
// but never read, which takes the whole dashboard down.
//
// A date crosses several parsers we do not control on its way to the screen:
// the browser's <input type="date">, Prisma's write path, Prisma's read path,
// a JSON round-trip through the Redis cache, and finally React. zod is the one
// boundary we own, so it enforces the strictest common denominator rather than
// trying to mirror any single downstream parser: a four-digit YYYY-MM-DD, which
// is unambiguous everywhere. That is exactly what <input type="date"> emits, so
// legitimate input is never affected.

const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Midnight UTC on a calendar day. `month` is 1-based. */
function utcDay(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

/** Midnight UTC today — the reference point for every date bound below. */
function utcToday(now = new Date()): Date {
  return utcDay(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate());
}

const MIN_DATE = utcDay(1970, 1, 1);
const MAX_YEARS_AHEAD = 50;

function maxDate(now = new Date()): Date {
  return utcDay(
    now.getUTCFullYear() + MAX_YEARS_AHEAD,
    now.getUTCMonth() + 1,
    now.getUTCDate(),
  );
}

/**
 * A calendar date, parsed by hand into midnight UTC. Shared by every date field
 * so they cannot drift apart. Messages stay in user language — the technical
 * reason a date is rejected is never something the person filling in the form
 * can act on.
 */
export const calendarDate = z
  .string({ error: "Please enter a valid date" })
  .trim()
  .transform((value, ctx) => {
    const match = CALENDAR_DATE.exec(value);
    if (!match) {
      ctx.addIssue({ code: "custom", message: "Please enter a valid date" });
      return z.NEVER;
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = utcDay(year, month, day);

    // Date.UTC silently rolls impossible input over instead of rejecting it:
    // Feb 31 becomes Mar 3, month 13 becomes January of the next year, and a
    // two-digit year lands in the 1900s. Comparing the parts we get back is the
    // only way to catch that.
    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      ctx.addIssue({ code: "custom", message: "That date doesn't exist" });
      return z.NEVER;
    }

    if (date < MIN_DATE) {
      ctx.addIssue({
        code: "custom",
        message: "Date must be on or after January 1, 1970",
      });
      return z.NEVER;
    }

    if (date > maxDate()) {
      ctx.addIssue({ code: "custom", message: "Year looks incorrect" });
      return z.NEVER;
    }

    return date;
  });

export const subscriptionSchema = z
  .object({
    name: z.string().min(1).max(100),
    amount: z.coerce.number().positive(),
    currency: z.enum(["USD", "CAD"]),
    billingCycle: z.enum(["MONTHLY", "YEARLY", "WEEKLY", "QUARTERLY"]),
    nextBillingDate: calendarDate,
    startDate: calendarDate,
    category: z.string().optional(),
  })
  .refine((data) => data.nextBillingDate >= data.startDate, {
    message: "Next billing date must be on or after start date",
    path: ["nextBillingDate"],
  })
  .refine(
    // Compared against midnight UTC, not local midnight: calendarDate builds
    // its Dates in UTC, so a local-midnight reference would reject today's own
    // date for anyone west of UTC.
    (data) => data.nextBillingDate >= utcToday(),
    {
      message: "Next billing date cannot be in the past",
      path: ["nextBillingDate"],
    },
  );
