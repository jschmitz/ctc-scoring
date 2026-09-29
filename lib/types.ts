import type { ScoringComponent } from "./scoring";

export type EventStatus = "setup" | "live" | "final";

export type Event = {
  id: string;
  name: string;
  event_date: string | null;
  status: EventStatus;
  teams_per_station: number;
  current_round: number;
  is_simulation: boolean;
};

export type Challenge = {
  id: string;
  event_id: string;
  position: number;
  name: string;
  description: string;
  time_limit_sec: number;
  scoring_components: ScoringComponent[];
};

export type Team = {
  id: string;
  event_id: string;
  number: number;
  name: string;
  captain: string;
  color: string;
};

export type Slot = {
  id: string;
  round_number: number;
  team_id: string;
  challenge_id: string;
};

export type Score = {
  id: string;
  team_id: string;
  challenge_id: string;
  total: number;
  notes: string;
  entered_by: string | null;
  entered_at: string;
  updated_at: string;
  score_components: { component_id: string; count: number }[];
};
