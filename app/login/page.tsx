import { SiteHeader } from "@/components/EventNav";
import { LoginForm } from "./LoginForm";
import { OpenLoginForm } from "./OpenLoginForm";

// LOGIN_MODE=magic-link restores email sign-in. Anything else (the default for
// now) is the temporary open login in ./actions.ts: any email, no email sent.
export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next, error } = await searchParams;
  const nextPath = typeof next === "string" ? next : "/admin";
  const magicLink = process.env.LOGIN_MODE === "magic-link";
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-sm px-4 py-16">
        <h1 className="text-2xl font-semibold">Staff sign in</h1>
        {magicLink ? (
          <>
            <p className="mt-2 text-sm text-slate-600">We&apos;ll email you a sign-in link. Only emails on the staff list can enter scores.</p>
            {error && <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">That sign-in link didn&apos;t work. Request a new one.</p>}
            <LoginForm next={nextPath} />
          </>
        ) : (
          <>
            <p className="mt-2 text-sm text-slate-600">Enter your email to sign in.</p>
            <OpenLoginForm next={nextPath} />
          </>
        )}
      </main>
    </>
  );
}
