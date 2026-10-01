import Link from "next/link";
import { SiteHeader } from "@/components/EventNav";
import { NotStaff } from "@/components/NotStaff";
import { requireStaff } from "@/lib/requireStaff";
import { NewEventForm } from "./NewEventForm";

export default async function NewEventPage() {
  const email = await requireStaff("/admin/new");
  if (!email) return <NotStaff />;
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-xl px-4 py-12">
        <Link href="/admin" className="text-sm text-accent-strong hover:underline">
          ← All events
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">New event</h1>
        <p className="mt-2 text-sm text-slate-600">
          Start from the organizers&apos; scoring sheet (its teams and challenges), copy the challenges of an existing event, or
          start blank.
        </p>
        <NewEventForm />
      </main>
    </>
  );
}
