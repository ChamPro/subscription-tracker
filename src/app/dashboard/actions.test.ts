import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// --- Mock all server-side deps so we can run the actions in isolation. ---
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    subscription: {
      create: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));
// The actions now delegate cache invalidation to invalidateUserCache, which
// swallows its own errors. So we mock that function here and assert delegation;
// its error-handling is covered separately in src/lib/redis.test.ts.
vi.mock("@/lib/redis", () => ({ invalidateUserCache: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// redirect() really throws NEXT_REDIRECT; stub it to a no-op so it doesn't
// masquerade as a failure in our "should not throw" assertions.
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { createSubscription } from "./new/actions";
import { updateSubscription } from "./[id]/edit/actions";
import { deleteSubscription } from "./actions";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { invalidateUserCache } from "@/lib/redis";

const authMock = vi.mocked(auth);
const create = vi.mocked(prisma.subscription.create);
const updateMany = vi.mocked(prisma.subscription.updateMany);
const deleteMany = vi.mocked(prisma.subscription.deleteMany);
const invalidate = vi.mocked(invalidateUserCache);

// Valid form payload; far-future nextBillingDate satisfies both schema refines.
function validForm() {
  const fd = new FormData();
  fd.set("name", "Netflix");
  fd.set("amount", "10");
  fd.set("currency", "USD");
  fd.set("billingCycle", "MONTHLY");
  fd.set("nextBillingDate", "2099-01-01");
  fd.set("startDate", "2020-01-01");
  return fd;
}

function invalidForm() {
  const fd = new FormData();
  // missing required fields — amount is negative, name is empty
  fd.set("name", "");
  fd.set("amount", "-5");
  fd.set("currency", "USD");
  fd.set("billingCycle", "MONTHLY");
  fd.set("nextBillingDate", "2099-01-01");
  fd.set("startDate", "2020-01-01");
  return fd;
}

const emptyState = {};

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue({ user: { id: "u1" } } as never);
  create.mockResolvedValue({} as never);
  updateMany.mockResolvedValue({ count: 1 } as never);
  deleteMany.mockResolvedValue({ count: 1 } as never);
  invalidate.mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createSubscription", () => {
  it("creates, then invalidates the user's cache on valid input", async () => {
    const result = await createSubscription(emptyState, validForm());

    expect(create).toHaveBeenCalledOnce();
    expect(invalidate).toHaveBeenCalledWith("u1");
    // redirect is mocked so no return value on success path
    expect(result).toBeUndefined();
  });

  it("returns field errors and does NOT call prisma on invalid input", async () => {
    const result = await createSubscription(emptyState, invalidForm());

    expect(result).toMatchObject({ errors: expect.any(Object) });
    expect(create).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("throws Unauthorized when there is no session", async () => {
    authMock.mockResolvedValue(null as never);

    await expect(
      createSubscription(emptyState, validForm()),
    ).rejects.toThrow("Unauthorized");

    expect(create).not.toHaveBeenCalled();
  });
});

describe("updateSubscription", () => {
  it("updates, then invalidates the user's cache on valid input", async () => {
    const result = await updateSubscription("sub1", emptyState, validForm());

    expect(updateMany).toHaveBeenCalledOnce();
    expect(invalidate).toHaveBeenCalledWith("u1");
    expect(result).toBeUndefined();
  });

  it("returns field errors and does NOT call prisma on invalid input", async () => {
    const result = await updateSubscription("sub1", emptyState, invalidForm());

    expect(result).toMatchObject({ errors: expect.any(Object) });
    expect(updateMany).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("throws Unauthorized when there is no session", async () => {
    authMock.mockResolvedValue(null as never);

    await expect(
      updateSubscription("sub1", emptyState, validForm()),
    ).rejects.toThrow("Unauthorized");

    expect(updateMany).not.toHaveBeenCalled();
  });
});

describe("deleteSubscription", () => {
  function deleteForm() {
    const fd = new FormData();
    fd.set("id", "sub1");
    return fd;
  }

  it("deletes, then invalidates the user's cache", async () => {
    await expect(deleteSubscription(deleteForm())).resolves.toBeUndefined();

    expect(deleteMany).toHaveBeenCalledOnce();
    expect(invalidate).toHaveBeenCalledWith("u1");
  });
});
