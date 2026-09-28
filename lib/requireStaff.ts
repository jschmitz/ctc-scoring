import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";

/**
 * For staff-only pages. Redirects signed-out visitors to /login and returns
 * null for signed-in users who aren't on the staff list. RLS enforces the same rule on writes.
 */
export async function requireStaff(path: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const email = data?.claims?.email as string | undefined;
  if (!email) redirect(`/login?next=${encodeURIComponent(path)}`);
  const { data: isStaff } = await supabase.rpc("is_staff");
  return isStaff ? email : null;
}
