import { NotStaff } from "@/components/NotStaff";
import { requireStaff } from "@/lib/requireStaff";
import { NewEventForm } from "./NewEventForm";

export default async function AdminPage() {
  const email = await requireStaff("/admin");
  if (!email) return <NotStaff />;
  return (
    <main className="mx-auto w-full max-w-xl px-4 py-12">
      <h1 className="text-2xl font-semibold">New event</h1>
      <p className="mt-2 text-sm text-slate-600">
        Start from an existing event to reuse its challenges and scoring rules, or start blank.
      </p>
      <NewEventForm />
    </main>
  );
}
