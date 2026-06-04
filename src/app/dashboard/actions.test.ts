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
vi.mock("@/lib/redis", () => ({
  redis: { del: vi.fn() },
  monthlyTotalKey: (userId: string) => `user:${userId}:monthly-total`,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// redirect() really throws NEXT_REDIRECT; stub it to a no-op so it doesn't
// masquerade as a failure in our "should not throw" assertions.
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { createSubscription } from "./new/actions";
import { updateSubscription } from "./[id]/edit/actions";
import { deleteSubscription } from "./actions";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";

const authMock = vi.mocked(auth);
const create = vi.mocked(prisma.subscription.create);
const updateMany = vi.mocked(prisma.subscription.updateMany);
const deleteMany = vi.mocked(prisma.subscription.deleteMany);
const del = vi.mocked(redis.del);

const KEY = "user:u1:monthly-total";

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

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue({ user: { id: "u1" } } as never);
  create.mockResolvedValue({} as never);
  updateMany.mockResolvedValue({ count: 1 } as never);
  deleteMany.mockResolvedValue({ count: 1 } as never);
  del.mockResolvedValue(1 as never);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createSubscription", () => {
  it("calls redis.del with the correct key after creating", async () => {
    await createSubscription(validForm());

    expect(create).toHaveBeenCalledOnce();
    expect(del).toHaveBeenCalledWith(KEY);
  });

  it("redis.del THROWS: create still completes, error only logged", async () => {
    del.mockRejectedValue(new Error("redis down"));

    await expect(createSubscription(validForm())).resolves.toBeUndefined();

    expect(create).toHaveBeenCalledOnce();
    expect(console.error).toHaveBeenCalled();
  });
});

describe("updateSubscription", () => {
  it("calls redis.del with the correct key after updating", async () => {
    await updateSubscription("sub1", validForm());

    expect(updateMany).toHaveBeenCalledOnce();
    expect(del).toHaveBeenCalledWith(KEY);
  });

  it("redis.del THROWS: update still completes, error only logged", async () => {
    del.mockRejectedValue(new Error("redis down"));

    await expect(
      updateSubscription("sub1", validForm()),
    ).resolves.toBeUndefined();

    expect(updateMany).toHaveBeenCalledOnce();
    expect(console.error).toHaveBeenCalled();
  });
});

describe("deleteSubscription", () => {
  function deleteForm() {
    const fd = new FormData();
    fd.set("id", "sub1");
    return fd;
  }

  it("calls redis.del with the correct key after deleting", async () => {
    await deleteSubscription(deleteForm());

    expect(deleteMany).toHaveBeenCalledOnce();
    expect(del).toHaveBeenCalledWith(KEY);
  });

  it("redis.del THROWS: delete still completes, error only logged", async () => {
    del.mockRejectedValue(new Error("redis down"));

    await expect(deleteSubscription(deleteForm())).resolves.toBeUndefined();

    expect(deleteMany).toHaveBeenCalledOnce();
    expect(console.error).toHaveBeenCalled();
  });
});
