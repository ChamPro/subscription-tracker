import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL });
const prisma = new PrismaClient({ adapter });

const TARGET_EMAIL = "marooonfi@gmail.com";

async function main() {
  const user = await prisma.user.findUnique({ where: { email: TARGET_EMAIL } });

  if (!user) {
    throw new Error(
      `User ${TARGET_EMAIL} not found. Sign in via Google first to create the User row.`,
    );
  }

  const cleared = await prisma.subscription.deleteMany({
    where: { userId: user.id },
  });
  console.log(`Cleared ${cleared.count} existing subscription(s) for ${TARGET_EMAIL}`);

  const today = new Date();
  const nextBillingDate = new Date("2026-06-27");

  const created = await prisma.subscription.createMany({
    data: [
      {
        userId: user.id,
        name: "Netflix",
        amount: 15.49,
        currency: "USD",
        billingCycle: "MONTHLY",
        nextBillingDate,
        startDate: today,
      },
      {
        userId: user.id,
        name: "Spotify",
        amount: 10.99,
        currency: "USD",
        billingCycle: "MONTHLY",
        nextBillingDate,
        startDate: today,
      },
      {
        userId: user.id,
        name: "ChatGPT Plus",
        amount: 20.0,
        currency: "USD",
        billingCycle: "MONTHLY",
        nextBillingDate,
        startDate: today,
      },
    ],
  });

  console.log(`Created ${created.count} subscription(s)`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
