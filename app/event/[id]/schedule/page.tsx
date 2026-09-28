import { Schedule } from "./Schedule";

export default async function SchedulePage({ params }: PageProps<"/event/[id]/schedule">) {
  const { id } = await params;
  return <Schedule eventId={id} />;
}
