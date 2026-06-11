import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export default async function Home() {
  const session = await auth();

  if (session?.user) {
    redirect("/dashboard");
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 dark:bg-black">
      <div className="flex flex-col items-center gap-6 text-center px-6">
        <h1 className="text-3xl font-semibold text-black dark:text-zinc-50">
          Subscription Tracker
        </h1>
        <p className="max-w-sm text-base text-zinc-600 dark:text-zinc-400">
          Track your subscriptions and see what you&apos;re spending each month.
        </p>
        <Link
          href="/login"
          className="rounded-full bg-foreground px-6 py-3 text-base font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
        >
          Sign in
        </Link>
      </div>
    </div>
  );
}
