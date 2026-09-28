import { NextResponse } from "next/server";

/**
 * Health check for the Docker healthcheck and post-deploy verification.
 * Does a real round trip through Kong and PostgREST to Postgres, so a 200 means
 * the data path works, not just that Node is up.
 *
 * Uses SUPABASE_INTERNAL_URL (http://kong:8000 in docker-compose.yml) when set,
 * so the check doesn't depend on DNS, TLS, or host nginx.
 */
export async function GET() {
  const url = process.env.SUPABASE_INTERNAL_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ status: "error", message: "Supabase env vars missing" }, { status: 503 });
  }

  try {
    const res = await fetch(`${url}/rest/v1/events?select=id&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      return NextResponse.json({ status: "error", message: "Database unreachable", code: res.status }, { status: 503 });
    }
    return NextResponse.json({ status: "ok" });
  } catch (err) {
    return NextResponse.json(
      { status: "error", message: err instanceof Error ? err.message : "Unknown error" },
      { status: 503 },
    );
  }
}
