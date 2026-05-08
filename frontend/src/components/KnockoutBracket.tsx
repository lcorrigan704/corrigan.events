import { Badge } from "./ui/badge";
import { Card, CardContent, CardHeader } from "./ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { flagForItem, homeKitForItem } from "../lib/teams";
import { cn } from "../lib/utils";
import type { CSSProperties } from "react";
import type { DrawItem, KnockoutMatch, Slot, Sweepstake } from "../types";

type TeamMarkStyle = CSSProperties & {
  "--team-primary": string;
  "--team-secondary": string;
};

const roundOrder = ["Round of 32", "Round of 16", "Quarter-finals", "Semi-finals", "Third place", "Final"];
const roundTabLabels: Record<string, string> = {
  "Round of 32": "R32",
  "Round of 16": "R16",
  "Quarter-finals": "QF",
  "Semi-finals": "SF",
  "Third place": "3rd",
  Final: "Final",
};

function teamName(code: string | null, itemsByCode: Record<string, DrawItem>, placeholder: string) {
  if (!code) return placeholder;
  return itemsByCode[code]?.name ?? placeholder;
}

function MatchTeamRow({
  code,
  placeholder,
  score,
  winnerCode,
  itemsByCode,
  assignmentsByCode,
  highlightedParticipantNames,
}: {
  code: string | null;
  placeholder: string;
  score: number | null;
  winnerCode: string | null;
  itemsByCode: Record<string, DrawItem>;
  assignmentsByCode: Record<string, Slot>;
  highlightedParticipantNames: Set<string>;
}) {
  const item = code ? itemsByCode[code] : null;
  const slot = code ? assignmentsByCode[code] : null;
  const isWinner = Boolean(code && winnerCode === code);
  const highlighted = Boolean(slot && highlightedParticipantNames.has(slot.name));
  if (!item) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-md border bg-background px-2 py-1.5 font-medium">
        <span className="min-w-0 truncate">{placeholder}</span>
        {score !== null && <span className="shrink-0 tabular-nums">{score}</span>}
      </div>
    );
  }

  const kit = homeKitForItem(item);
  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-2 rounded-md border px-2 py-1.5 text-sm shadow-sm",
        isWinner && "ring-2 ring-primary/60",
        highlighted && "border-emerald-500/70 ring-2 ring-emerald-500/70"
      )}
      style={{
        "--team-primary": kit.primary,
        "--team-secondary": kit.secondary,
        background: `linear-gradient(135deg, color-mix(in srgb, var(--team-primary) 18%, hsl(var(--card))) 0 78%, color-mix(in srgb, var(--team-secondary) 28%, hsl(var(--card))) 78% 100%)`,
      } as TeamMarkStyle}
    >
      <div
        className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-background/80 text-sm shadow-sm"
        style={{
          "--team-primary": kit.primary,
          "--team-secondary": kit.secondary,
          background: `linear-gradient(135deg, var(--team-primary) 0 68%, var(--team-secondary) 68% 100%)`,
        } as TeamMarkStyle}
      >
        <span>{flagForItem(item)}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold leading-tight">{teamName(code, itemsByCode, placeholder)}</div>
        <div className="truncate text-[0.68rem] text-muted-foreground">{slot?.name ?? "Unassigned"}</div>
      </div>
      {score !== null && <span className="shrink-0 text-sm font-black tabular-nums">{score}</span>}
    </div>
  );
}

function MatchCard({
  match,
  itemsByCode,
  assignmentsByCode,
  highlightedParticipantNames,
}: {
  match: KnockoutMatch;
  itemsByCode: Record<string, DrawItem>;
  assignmentsByCode: Record<string, Slot>;
  highlightedParticipantNames: Set<string>;
}) {
  return (
    <div className="relative rounded-md border bg-card p-3 text-sm shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-3">
        <Badge variant="outline">M{match.match_no}</Badge>
        {match.venue && <span className="truncate text-xs text-muted-foreground">{match.venue}</span>}
      </div>
      <div className="space-y-1.5">
        <MatchTeamRow
          code={match.home_code}
          placeholder={match.home_placeholder}
          score={match.home_score}
          winnerCode={match.winner_code}
          itemsByCode={itemsByCode}
          assignmentsByCode={assignmentsByCode}
          highlightedParticipantNames={highlightedParticipantNames}
        />
        <MatchTeamRow
          code={match.away_code}
          placeholder={match.away_placeholder}
          score={match.away_score}
          winnerCode={match.winner_code}
          itemsByCode={itemsByCode}
          assignmentsByCode={assignmentsByCode}
          highlightedParticipantNames={highlightedParticipantNames}
        />
      </div>
    </div>
  );
}

export function KnockoutBracket({ sweepstake, highlightedParticipantNames = [] }: { sweepstake: Sweepstake; highlightedParticipantNames?: string[] }) {
  const itemsByCode = sweepstake.items.reduce<Record<string, DrawItem>>((acc, item) => {
    acc[item.code] = item;
    return acc;
  }, {});
  const assignmentsByCode = sweepstake.slots.reduce<Record<string, Slot>>((acc, slot) => {
    if (slot.assigned_item) {
      acc[slot.assigned_item.code] = slot;
    }
    return acc;
  }, {});
  const rounds = roundOrder
    .map((label) => ({
      label,
      matches: sweepstake.knockout_matches.filter((match) => match.round_name === label),
    }))
    .filter((round) => round.matches.length > 0);
  const highlightedNames = new Set(highlightedParticipantNames);

  return (
    <Card className="min-h-0 w-full min-w-0 max-w-full">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Knockout route</h2>
            <p className="text-sm text-muted-foreground">Official 2026 route from Round of 32 to final.</p>
          </div>
          <Badge variant="secondary">Bracket</Badge>
        </div>
      </CardHeader>
      <CardContent className="min-w-0 max-w-full">
        <Tabs defaultValue={rounds[0]?.label} className="w-full flex-col gap-4 md:hidden">
          <TabsList className="grid h-10 w-full grid-cols-6">
            {rounds.map((round) => (
              <TabsTrigger key={round.label} value={round.label} className="px-1 text-xs">
                {roundTabLabels[round.label] ?? round.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {rounds.map((round) => (
            <TabsContent key={round.label} value={round.label} className="mt-0 w-full min-w-0">
              <Card>
                <CardHeader className="pb-3">
                  <h3 className="text-base font-bold">{round.label}</h3>
                  <p className="text-xs text-muted-foreground">{round.matches.length} matches</p>
                </CardHeader>
                <CardContent className="space-y-2">
                  {round.matches.map((match) => (
                    <MatchCard
                      key={match.match_no}
                      match={match}
                      itemsByCode={itemsByCode}
                      assignmentsByCode={assignmentsByCode}
                      highlightedParticipantNames={highlightedNames}
                    />
                  ))}
                </CardContent>
              </Card>
            </TabsContent>
          ))}
        </Tabs>

        <div className="hidden w-full max-w-[calc(100vw-2rem)] overflow-x-auto pb-2 md:block md:max-w-[calc(100vw-4rem)] 2xl:max-w-full">
          <div className="grid min-w-[1320px] grid-cols-[320px_220px_200px_180px_180px_180px] gap-3">
            {rounds.map((round) => (
              <section key={round.label} className="flex min-h-[620px] flex-col">
                <div className="sticky top-0 z-10 mb-3 bg-card pb-2 text-xs font-bold uppercase text-muted-foreground">
                  {round.label}
                </div>
                <div className="grid flex-1 content-around gap-2">
                  {round.matches.map((match) => (
                    <MatchCard
                      key={match.match_no}
                      match={match}
                      itemsByCode={itemsByCode}
                      assignmentsByCode={assignmentsByCode}
                      highlightedParticipantNames={highlightedNames}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
