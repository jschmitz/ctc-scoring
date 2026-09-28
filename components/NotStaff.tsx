export function NotStaff() {
  return (
    <main className="mx-auto w-full max-w-md px-4 py-16 text-center">
      <h1 className="text-xl font-semibold">Staff only</h1>
      <p className="mt-2 text-slate-600">You&apos;re signed in, but your email isn&apos;t on the staff list. Ask an organizer to add you.</p>
    </main>
  );
}
