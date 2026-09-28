import { NotStaff } from "@/components/NotStaff";
import { requireStaff } from "@/lib/requireStaff";
import { ScoreTable } from "./ScoreTable";

export default async function ScorePage({ params }: PageProps<"/score/[eventId]">) {
  const { eventId } = await params;
  const email = await requireStaff(`/score/${eventId}`);
  if (!email) return <NotStaff />;
  return <ScoreTable eventId={eventId} staffEmail={email} />;
}
