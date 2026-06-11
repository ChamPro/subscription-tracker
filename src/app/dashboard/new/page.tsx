import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { NewSubscriptionForm } from "./NewSubscriptionForm";

export default async function NewSubscriptionPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const today = new Date().toISOString().slice(0, 10);

  return <NewSubscriptionForm today={today} />;
}
