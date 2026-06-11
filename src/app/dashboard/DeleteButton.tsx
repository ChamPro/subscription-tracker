"use client";

import { deleteSubscription } from "./actions";

interface Props {
  id: string;
}

export function DeleteButton({ id }: Props) {
  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    if (!confirm("Delete this subscription?")) {
      e.preventDefault();
    }
  }

  return (
    <form action={deleteSubscription} onSubmit={handleSubmit}>
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="rounded-full border border-solid border-black/[.08] px-3 py-1.5 text-sm transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
      >
        Delete
      </button>
    </form>
  );
}
