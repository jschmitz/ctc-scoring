import { NotStaff } from "@/components/NotStaff";
import { requireStaff } from "@/lib/requireStaff";
import { EventSetup } from "./EventSetup";

export default async function EventSetupPage({ params }: PageProps<"/admin/events/[id]">) {
  const { id } = await params;
  const email = await requireStaff(`/admin/events/${id}`);
  if (!email) return <NotStaff />;
  return <EventSetup eventId={id} />;
}
