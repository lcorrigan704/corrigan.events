import type { CSSProperties } from "react";
import { Badge } from "./ui/badge";
import { Card, CardContent, CardHeader } from "./ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { flagForItem, homeKitForItem } from "../lib/teams";
import type { DrawItem, GroupStanding, Slot, Sweepstake } from "../types";

type TeamMarkStyle = CSSProperties & {
  "--team-primary": string;
  "--team-secondary": string;
};

function groupItems(items: DrawItem[]) {
  return items.reduce<Record<string, DrawItem[]>>((groups, item) => {
    const groupName = item.group_name ?? "Other";
    groups[groupName] = [...(groups[groupName] ?? []), item];
    return groups;
  }, {});
}

function assignmentByItem(slots: Slot[]) {
  return slots.reduce<Record<number, Slot>>((assignments, slot) => {
    if (slot.assigned_item) {
      assignments[slot.assigned_item.id] = slot;
    }
    return assignments;
  }, {});
}

function standingForItem(item: DrawItem, standings: Record<string, GroupStanding>) {
  const standing = standings[item.code];
  if (standing) return standing;
  return {
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goals_for: 0,
    goals_against: 0,
    goal_difference: 0,
    points: 0,
    rank: null,
    is_final: false,
  };
}

function sortGroupStandings(items: DrawItem[], standings: Record<string, GroupStanding>) {
  return [...items].sort((a, b) => {
    const aStanding = standingForItem(a, standings);
    const bStanding = standingForItem(b, standings);

    return (
      (aStanding.rank ?? 99) - (bStanding.rank ?? 99) ||
      bStanding.points - aStanding.points ||
      bStanding.goal_difference - aStanding.goal_difference ||
      bStanding.goals_for - aStanding.goals_for ||
      bStanding.wins - aStanding.wins ||
      a.id - b.id
    );
  });
}

function TeamStandingRow({ item, slot, standing, showAssignments = true }: { item: DrawItem; slot: Slot | undefined; standing: ReturnType<typeof standingForItem>; showAssignments?: boolean }) {
  const kit = homeKitForItem(item);

  return (
    <TableRow>
      <TableCell className="min-w-0 py-1.5 pr-1 whitespace-normal">
        <div className="flex min-w-0 items-center gap-2">
          <div
            className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-md border text-sm shadow-sm"
            style={{
              "--team-primary": kit.primary,
              "--team-secondary": kit.secondary,
              background: `linear-gradient(135deg, var(--team-primary) 0 68%, var(--team-secondary) 68% 100%)`,
            } as TeamMarkStyle}
          >
            <span>{flagForItem(item)}</span>
          </div>
          <div className="min-w-0 max-w-[108px] sm:max-w-[150px]">
            <div className="line-clamp-1 text-xs font-semibold leading-tight">{item.name}</div>
            {showAssignments && <div className="truncate text-[0.68rem] text-muted-foreground">{slot?.name ?? "Unassigned"}</div>}
          </div>
        </div>
      </TableCell>
      <TableCell className="px-1 py-1.5 text-center tabular-nums">{standing.played}</TableCell>
      <TableCell className="px-1 py-1.5 text-center tabular-nums">{standing.wins}</TableCell>
      <TableCell className="px-1 py-1.5 text-center tabular-nums">{standing.draws}</TableCell>
      <TableCell className="px-1 py-1.5 text-center tabular-nums">{standing.losses}</TableCell>
      <TableCell className="px-1 py-1.5 text-center tabular-nums">{standing.goal_difference}</TableCell>
      <TableCell className="px-1 py-1.5 text-center font-semibold tabular-nums">{standing.points}</TableCell>
    </TableRow>
  );
}

export function AssignmentTable({ sweepstake, showAssignments = true }: { sweepstake: Sweepstake; showAssignments?: boolean }) {
  const groupedItems = groupItems(sweepstake.items);
  const assignments = assignmentByItem(sweepstake.slots);
  const standings = sweepstake.standings.reduce<Record<string, GroupStanding>>((acc, standing) => {
    acc[standing.team_code] = standing;
    return acc;
  }, {});
  const groups = Object.keys(groupedItems).sort((a, b) => a.localeCompare(b));

  return (
    <Card className="min-h-0 w-full min-w-0 max-w-full">
      <CardHeader>
        <h2 className="text-lg font-bold">World Cup groups</h2>
        <p className="text-sm text-muted-foreground">
          {showAssignments ? "Teams, colours, flags, and assigned participant slots." : "Teams, colours, flags, and group standings."}
        </p>
      </CardHeader>
      <CardContent className="min-w-0 max-w-full px-3 sm:px-4">
        <div className="max-h-[calc(100vh-80px)] min-w-0 max-w-full space-y-4 overflow-y-auto pr-1">
          {groups.map((group) => (
            <section key={group} className="min-w-0 max-w-full overflow-hidden rounded-md border">
              <div className="mb-3 flex items-center justify-between gap-3 px-3 pt-3">
                <h3 className="text-sm font-bold">Group {group}</h3>
                <Badge variant="outline">{groupedItems[group].length} teams</Badge>
              </div>
              <div className="min-w-0 overflow-x-auto">
                <Table className="table-fixed">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[170px] py-2 pr-1">Team</TableHead>
                      <TableHead className="w-6 px-1 py-2 text-center">P</TableHead>
                      <TableHead className="w-6 px-1 py-2 text-center">W</TableHead>
                      <TableHead className="w-6 px-1 py-2 text-center">D</TableHead>
                      <TableHead className="w-6 px-1 py-2 text-center">L</TableHead>
                      <TableHead className="w-7 px-1 py-2 text-center">GD</TableHead>
                      <TableHead className="w-7 px-1 py-2 text-center">Pts</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortGroupStandings(groupedItems[group], standings).map((item) => (
                      <TeamStandingRow
                        key={item.id}
                        item={item}
                        slot={assignments[item.id]}
                        standing={standingForItem(item, standings)}
                        showAssignments={showAssignments}
                      />
                    ))}
                  </TableBody>
                </Table>
              </div>
            </section>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
