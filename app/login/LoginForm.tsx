"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function LoginForm({ next }: { next: string }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    const redirect = new URL("/auth/callback", window.location.origin);
    redirect.searchParams.set("next", next);
    const { error } = await createClient().auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: redirect.toString() },
    });
    if (error) {
      setStatus("error");
      setMessage(error.message);
    } else {
      setStatus("sent");
    }
  }

  if (status === "sent") {
    return <p className="mt-6 rounded-md bg-green-50 p-4 text-sm text-green-800">Check {email} for your sign-in link.</p>;
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-3">
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2"
      />
      <button
        disabled={status === "sending"}
        className="w-full rounded-md bg-accent px-3 py-2 font-medium text-white hover:bg-accent-strong disabled:opacity-60"
      >
        {status === "sending" ? "Sending…" : "Email me a link"}
      </button>
      {status === "error" && <p className="text-sm text-red-700">{message}</p>}
    </form>
  );
}
