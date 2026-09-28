import { Leaderboard } from "./Leaderboard";

export default async function LeaderboardPage({ params }: PageProps<"/event/[id]/leaderboard">) {
  const { id } = await params;
  return <Leaderboard eventId={id} />;
}
