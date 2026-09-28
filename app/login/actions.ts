"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type OpenLoginState = { error: string } | null;

/**
 * Temporary open login: any email signs straight in and becomes staff, with no
 * email sent. Used while LOGIN_MODE isn't "magic-link" (see app/login/page.tsx).
 *
 * It still produces a real Supabase session, so RLS works unchanged: the user
 * is created (already confirmed), added to `staff`, and signed in by minting a
 * one-time magic-link token server-side and exchanging it immediately.
 * Every login is logged with its email (`docker compose logs app`).
 *
 * To go back to email sign-in, set LOGIN_MODE=magic-link, and clear out any
 * staff rows this added that shouldn't stay.
 */
export async function openLogin(_prev: OpenLoginState, formData: FormData): Promise<OpenLoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const next = String(formData.get("next") ?? "/");
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a valid email address." };

  console.log(`[login] open login: ${email}`);

  let admin;
  try {
    admin = createAdminClient();
  } catch (err) {
    console.error(`[login] ${err instanceof Error ? err.message : err}`);
    return { error: "Sign-in isn't configured on the server yet." };
  }

  const created = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (created.error && created.error.code !== "email_exists") {
    console.error(`[login] createUser failed for ${email}: ${created.error.message}`);
    return { error: "Couldn't sign you in. Try again." };
  }

  const staff = await admin.from("staff").upsert({ email }, { onConflict: "email", ignoreDuplicates: true });
  if (staff.error) {
    console.error(`[login] adding ${email} to staff failed: ${staff.error.message}`);
    return { error: "Couldn't sign you in. Try again." };
  }

  // generateLink doesn't send anything; it just returns the token an email would carry.
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = link.data?.properties?.hashed_token;
  if (link.error || !tokenHash) {
    console.error(`[login] generateLink failed for ${email}: ${link.error?.message ?? "no token"}`);
    return { error: "Couldn't sign you in. Try again." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: tokenHash });
  if (error) {
    console.error(`[login] verifyOtp failed for ${email}: ${error.message}`);
    return { error: "Couldn't sign you in. Try again." };
  }

  redirect(safeNext);
}
