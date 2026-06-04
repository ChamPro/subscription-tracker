import { redis } from "../src/lib/redis";

async function main() {
  const key = "test:connection";
  const value = `hello-${Date.now()}`;

  console.log("Setting key…");
  await redis.set(key, value);

  console.log("Getting key…");
  const got = await redis.get(key);
  console.log("  got:", got);

  if (got !== value) {
    throw new Error(`Mismatch: expected "${value}", got "${got}"`);
  }

  console.log("Deleting key…");
  await redis.del(key);

  const afterDelete = await redis.get(key);
  console.log("  after delete:", afterDelete);

  console.log("\n✅ Redis connection OK");
}

main().catch((err) => {
  console.error("\n❌ Redis connection failed:", err);
  process.exit(1);
});
