import { LoginForm } from "./LoginForm";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next, error } = await searchParams;
  return (
    <main className="mx-auto w-full max-w-sm px-4 py-16">
      <h1 className="text-2xl font-semibold">Staff sign in</h1>
      <p className="mt-2 text-sm text-slate-600">We&apos;ll email you a sign-in link. Only emails on the staff list can enter scores.</p>
      {error && <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">That sign-in link didn&apos;t work. Request a new one.</p>}
      <LoginForm next={typeof next === "string" ? next : "/"} />
    </main>
  );
}
