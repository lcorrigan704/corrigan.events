import type { PayoutCategory } from "../types";

export const payoutLabels: Record<PayoutCategory, string> = {
  champion: "Champion",
  runner_up: "Runner up",
  third_place: "Third place",
  most_goals_scored: "Most goals scored",
  last_place: "Last place",
};

export const corePayoutCategories = ["champion", "runner_up", "third_place"] as const;
export const optionalPayoutCategories = ["most_goals_scored", "last_place"] as const;

export type OptionalPayoutCategory = (typeof optionalPayoutCategories)[number];
export type PayoutInput = { category: PayoutCategory; percentage: number };

export function hasPayout(payouts: PayoutInput[], category: OptionalPayoutCategory) {
  return payouts.some((payout) => payout.category === category);
}

export function toggleOptionalPayout(payouts: PayoutInput[], category: OptionalPayoutCategory) {
  if (hasPayout(payouts, category)) {
    return payouts.filter((payout) => payout.category !== category);
  }
  return [...payouts, { category, percentage: 0 }];
}

export function updatePayoutPercentage(payouts: PayoutInput[], category: PayoutCategory, percentage: number) {
  return payouts.map((payout) => (payout.category === category ? { ...payout, percentage } : payout));
}
