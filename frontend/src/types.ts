export type DrawItem = {
  id: number;
  name: string;
  code: string;
  group_name: string | null;
  seed_label: string | null;
  primary_color: string;
  secondary_color: string;
  status: string;
  placement: number | null;
};

export type GroupStanding = {
  team_code: string;
  group_name: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goals_for: number;
  goals_against: number;
  goal_difference: number;
  points: number;
  rank: number | null;
  is_final: boolean;
};

export type KnockoutMatch = {
  match_no: number;
  round_name: string;
  home_placeholder: string;
  away_placeholder: string;
  venue: string | null;
  home_code: string | null;
  away_code: string | null;
  home_score: number | null;
  away_score: number | null;
  winner_code: string | null;
  status: string;
};

export type Slot = {
  id: number;
  name: string;
  email: string | null;
  paid: boolean;
  assigned_item: DrawItem | null;
};

export type PayoutCategory = "champion" | "runner_up" | "third_place" | "most_goals_scored" | "last_place";

export type Payout = {
  category: PayoutCategory;
  label: string;
  percentage: number;
  amount_pence: number;
  outcome_status: "pending" | "provisional" | "final";
  winning_item: DrawItem | null;
  winning_slot: { id: number; name: string; email: string | null } | null;
};

export type AuditMetadata = {
  audit_version: number;
  audit_status: string;
  title: string;
  view_code: string;
  created_at: string;
  draw_scheduled_for: string;
  draw_published_at: string | null;
  draw_results_time: string;
  results_visible_from: string;
  draw_algorithm: string;
  assignment_digest: string | null;
  slot_count: number;
  draw_item_count: number;
  currency: "GBP";
  buy_in_pence: number;
  pot_pence: number;
  assignments: {
    slot_position: number;
    participant_name: string;
    team_code: string | null;
    team_name: string | null;
    group_name: string | null;
  }[];
};

export type Sweepstake = {
  id: number;
  title: string;
  template_type: "world_cup_2026";
  buy_in_pence: number;
  currency: "GBP";
  view_code: string;
  reveal_at: string;
  draw_status: string;
  is_revealed: boolean;
  pot_pence: number;
  share_url: string;
  slots: Slot[];
  items: DrawItem[];
  payouts: Payout[];
  standings: GroupStanding[];
  knockout_matches: KnockoutMatch[];
  sports_provider_status: string;
  audit_metadata: AuditMetadata | null;
};

export type CreatedSweepstake = {
  admin_url: string;
  view_code: string;
  share_url: string;
  sweepstake: Sweepstake;
};

export type PortalSweepstake = {
  id: number;
  title: string;
  organiser_email: string | null;
  view_code: string;
  participant_url: string;
  admin_url: string | null;
  draw_status: string;
  reveal_at: string;
  created_at: string;
  slot_count: number;
  named_slot_count: number;
  pot_pence: number;
};
