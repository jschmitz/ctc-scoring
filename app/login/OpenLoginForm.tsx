"use client";

import { useActionState } from "react";
import { openLogin } from "./actions";

export function OpenLoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(openLogin, null);

  return (
    <form action={action} className="mt-6 space-y-3">
      <input type="hidden" name="next" value={next} />
      <input
        type="email"
        name="email"
        required
        placeholder="you@example.com"
        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2"
      />
      <button
        disabled={pending}
        className="w-full rounded-md bg-accent px-3 py-2 font-medium text-white hover:bg-accent-strong disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
      {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
    </form>
  );
}
