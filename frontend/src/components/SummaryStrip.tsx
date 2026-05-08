import type { CSSProperties } from "react";
import { useMemo, useState } from "react";
import { Check, Copy, MoreHorizontal, ReceiptText, RotateCcw, ShieldCheck, Users, WalletCards } from "lucide-react";
import { cn, formatGBP } from "../lib/utils";
import { flagForItem, homeKitForItem } from "../lib/teams";
import type { DrawItem, Payout, Sweepstake } from "../types";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxValue,
} from "./ui/combobox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "./ui/drawer";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

type TeamPayoutStyle = CSSProperties & {
  "--team-primary": string;
  "--team-secondary": string;
  "--team-text": string;
};

const leaderPayoutCategories = new Set(["most_goals_scored", "last_place"]);
const podiumPayoutTheme: Partial<Record<Payout["category"], string>> = {
  champion:
    "border-amber-300/45 bg-gradient-to-br from-amber-50 via-yellow-100 to-amber-200 text-amber-950 shadow-[0_0_34px_rgba(245,158,11,0.18)] ring-1 ring-amber-300/20 dark:border-amber-400/30 dark:from-amber-500/20 dark:via-yellow-500/15 dark:to-amber-700/20 dark:text-amber-50 dark:shadow-[0_0_38px_rgba(251,191,36,0.13)]",
  runner_up:
    "border-slate-300/45 bg-gradient-to-br from-slate-50 via-zinc-100 to-slate-200 text-slate-950 shadow-[0_0_34px_rgba(148,163,184,0.18)] ring-1 ring-slate-300/20 dark:border-slate-300/25 dark:from-slate-300/20 dark:via-zinc-400/15 dark:to-slate-600/20 dark:text-slate-50 dark:shadow-[0_0_38px_rgba(203,213,225,0.11)]",
  third_place:
    "border-orange-300/45 bg-gradient-to-br from-orange-50 via-amber-100 to-orange-200 text-orange-950 shadow-[0_0_34px_rgba(234,88,12,0.16)] ring-1 ring-orange-300/20 dark:border-orange-400/30 dark:from-orange-500/20 dark:via-amber-600/15 dark:to-orange-800/20 dark:text-orange-50 dark:shadow-[0_0_38px_rgba(251,146,60,0.12)]",
};
const payoutPlaceholderEmoji: Partial<Record<Payout["category"], string>> = {
  champion: "🥇",
  runner_up: "🥈",
  third_place: "🥉",
};

function HighlightDrawer({
  participantNames,
  selectedNames,
  onSelectedNamesChange,
  open,
  onOpenChange,
}: {
  participantNames: string[];
  selectedNames: string[];
  onSelectedNamesChange: (names: string[]) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const filteredParticipantNames = useMemo(() => {
    const trimmedQuery = query.trim().toLowerCase();
    if (!trimmedQuery) {
      return participantNames;
    }
    return participantNames.filter((name) => name.toLowerCase().includes(trimmedQuery));
  }, [participantNames, query]);

  function toggleName(name: string) {
    if (selectedNames.includes(name)) {
      onSelectedNamesChange(selectedNames.filter((selectedName) => selectedName !== name));
      return;
    }

    onSelectedNamesChange([...selectedNames, name]);
    setQuery("");
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="w-screen max-w-none border-x-0 data-[vaul-drawer-direction=bottom]:max-h-[72dvh]">
        <DrawerHeader className="text-left">
          <DrawerTitle>Highlight your slots</DrawerTitle>
          <DrawerDescription>Select one or more participant names. This is saved on this device for this draw.</DrawerDescription>
        </DrawerHeader>
        <div className="flex min-h-0 flex-1 flex-col px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <Combobox
            multiple
            items={participantNames}
            value={selectedNames}
            onValueChange={(value) => onSelectedNamesChange(Array.isArray(value) ? value : selectedNames)}
          >
            <ComboboxChips className="min-h-11 w-full bg-background">
              <ComboboxValue>
                {(values) => (
                  <>
                    {values.map((value: string) => (
                      <ComboboxChip key={value}>{value}</ComboboxChip>
                    ))}
                    <ComboboxChipsInput
                      value={query}
                      onChange={(event) => setQuery(event.currentTarget.value)}
                      placeholder={selectedNames.length ? "" : "Search participant names"}
                      className="text-base sm:text-sm"
                    />
                  </>
                )}
              </ComboboxValue>
            </ComboboxChips>
          </Combobox>
          <div className="mt-3 min-h-0 flex-1 overflow-y-auto rounded-md border bg-background p-1">
            {filteredParticipantNames.length > 0 ? (
              filteredParticipantNames.map((name) => {
                const selected = selectedNames.includes(name);

                return (
                  <button
                    type="button"
                    key={name}
                    className={cn(
                      "flex min-h-10 w-full items-center justify-between gap-3 rounded-sm px-3 py-2 text-left text-sm font-medium outline-none transition-colors hover:bg-muted focus-visible:bg-muted",
                      selected && "bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-300"
                    )}
                    onClick={() => toggleName(name)}
                  >
                    <span className="truncate">{name}</span>
                    {selected ? <Check className="h-4 w-4 shrink-0" /> : null}
                  </button>
                );
              })
            ) : (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">No participants found.</div>
            )}
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            {selectedNames.length ? `${selectedNames.length} selected` : "No highlights selected"}
          </div>
          {selectedNames.length > 0 && (
            <Button type="button" variant="ghost" size="sm" className="mt-3" onClick={() => onSelectedNamesChange([])}>
              Clear highlights
            </Button>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function PayoutLeaderChip({ item }: { item: DrawItem }) {
  return (
    <span className="shrink-0 text-xl leading-none drop-shadow-sm" title={item.name}>
      <span aria-hidden="true">{flagForItem(item)}</span>
      <span className="sr-only">{item.name}</span>
    </span>
  );
}

function PayoutPlaceholderChip({ emoji, label }: { emoji: string; label: string }) {
  return (
    <span className="shrink-0 text-xl leading-none drop-shadow-sm" title={label}>
      <span aria-hidden="true">{emoji}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

function PayoutCard({ payout }: { payout: Payout }) {
  const isLeaderPayout = leaderPayoutCategories.has(payout.category);
  const item = payout.winning_item;
  const isFinalOutcome = item && payout.outcome_status === "final";
  const placeholderEmoji = payoutPlaceholderEmoji[payout.category];
  const shouldShowProvisionalLeader = isLeaderPayout && payout.category !== "last_place" && item && payout.outcome_status === "provisional";

  if (isFinalOutcome) {
    const kit = homeKitForItem(item);
    return (
      <div
        className="relative overflow-hidden rounded-md border px-3 py-2 shadow-sm"
        style={{
          "--team-primary": kit.primary,
          "--team-secondary": kit.secondary,
          "--team-text": kit.text,
          color: "var(--team-text)",
          background:
            "linear-gradient(135deg, color-mix(in srgb, var(--team-primary) 90%, black 10%) 0 72%, var(--team-secondary) 72% 100%)",
        } as TeamPayoutStyle}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-black/10 via-transparent to-white/10" />
        <div className="relative flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <div className="truncate text-sm font-black">{payout.label}</div>
              <Badge variant="secondary" className="size-7 shrink-0 justify-center rounded-full bg-white/85 px-0 text-base text-black">
                {flagForItem(item)}
              </Badge>
            </div>
            <div className="mt-1 flex min-w-0 items-center gap-2 text-xs font-semibold opacity-90">
              <span className="truncate">{item.name}</span>
              {payout.winning_slot ? <span className="truncate opacity-80">{payout.winning_slot.name}</span> : null}
            </div>
          </div>
          <div className="shrink-0 text-right text-xs font-semibold opacity-85">{payout.percentage}% · {formatGBP(payout.amount_pence)}</div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-md border bg-card px-3 py-2",
        podiumPayoutTheme[payout.category] ?? "border-border shadow-sm"
      )}
    >
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold">{payout.label}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          {payout.percentage}% · {formatGBP(payout.amount_pence)}
        </div>
      </div>
      {shouldShowProvisionalLeader ? (
        <PayoutLeaderChip item={item} />
      ) : placeholderEmoji ? (
        <PayoutPlaceholderChip emoji={placeholderEmoji} label={payout.label} />
      ) : null}
    </div>
  );
}

function DrawActionsMenu({
  sweepstake,
  onReplayDraw,
  highlightedParticipantNames,
  onHighlightedParticipantNamesChange,
}: {
  sweepstake: Sweepstake;
  onReplayDraw?: () => void;
  highlightedParticipantNames: string[];
  onHighlightedParticipantNamesChange?: (names: string[]) => void;
}) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [highlightOpen, setHighlightOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const auditJson = useMemo(() => JSON.stringify(sweepstake.audit_metadata ?? {}, null, 2), [sweepstake.audit_metadata]);
  const participantNames = useMemo(
    () => Array.from(new Set(sweepstake.slots.filter((slot) => slot.paid && slot.name.trim()).map((slot) => slot.name))),
    [sweepstake.slots]
  );

  const canHighlightSlots = Boolean(onHighlightedParticipantNamesChange && participantNames.length > 0);

  if (!sweepstake.audit_metadata && !onReplayDraw && !canHighlightSlots) {
    return null;
  }

  async function copyAuditJson() {
    await navigator.clipboard.writeText(auditJson);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <>
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" size="icon-sm" aria-label="Draw actions">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-56 p-2">
          {canHighlightSlots && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full justify-start"
              onClick={() => {
                setPopoverOpen(false);
                setHighlightOpen(true);
              }}
            >
              <Users className="h-4 w-4" />
              Highlight my slots
            </Button>
          )}
          {onReplayDraw && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full justify-start"
              onClick={() => {
                setPopoverOpen(false);
                onReplayDraw();
              }}
            >
              <RotateCcw className="h-4 w-4" />
              Replay draw
            </Button>
          )}
          {sweepstake.audit_metadata && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full justify-start"
              onClick={() => {
                setPopoverOpen(false);
                setDialogOpen(true);
              }}
            >
              <ShieldCheck className="h-4 w-4" />
              View audit metadata
            </Button>
          )}
        </PopoverContent>
      </Popover>
      <HighlightDrawer
        participantNames={participantNames}
        selectedNames={highlightedParticipantNames}
        onSelectedNamesChange={onHighlightedParticipantNamesChange ?? (() => {})}
        open={highlightOpen}
        onOpenChange={setHighlightOpen}
      />
      {sweepstake.audit_metadata && (
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>Draw audit metadata</DialogTitle>
              <DialogDescription>Published draw metadata and the assignment digest. The random seed is not exposed.</DialogDescription>
            </DialogHeader>
            <div className="flex justify-end">
              <Button type="button" variant="outline" size="sm" onClick={copyAuditJson}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? "Copied" : "Copy JSON"}
              </Button>
            </div>
            <pre className="max-h-[60vh] overflow-auto rounded-md border bg-muted p-3 text-xs leading-relaxed">
              <code>{auditJson}</code>
            </pre>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

export function SummaryStrip({
  sweepstake,
  onReplayDraw,
  highlightedParticipantNames = [],
  onHighlightedParticipantNamesChange = () => {},
}: {
  sweepstake: Sweepstake;
  onReplayDraw?: () => void;
  highlightedParticipantNames?: string[];
  onHighlightedParticipantNamesChange?: (names: string[]) => void;
}) {
  return (
    <div>
      <Card>
        <CardContent className="p-4">
          <div className="grid gap-4 xl:grid-cols-[240px_minmax(0,1fr)]">
            <div>
              <div className="flex items-center gap-2 text-xs uppercase text-muted-foreground">
                <WalletCards className="h-4 w-4" />
                Total pot
              </div>
              <div className="mt-2 text-3xl font-black">{formatGBP(sweepstake.pot_pence)}</div>
            </div>

            <div className="min-w-0">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs uppercase text-muted-foreground">
                  <ReceiptText className="h-4 w-4" />
                  Payout terms
                </div>
                <div className="flex items-center gap-2">
                  <Badge>{formatGBP(sweepstake.buy_in_pence)} buy-in</Badge>
                  <DrawActionsMenu
                    sweepstake={sweepstake}
                    onReplayDraw={onReplayDraw}
                    highlightedParticipantNames={highlightedParticipantNames}
                    onHighlightedParticipantNamesChange={onHighlightedParticipantNamesChange}
                  />
                </div>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {sweepstake.payouts.map((payout) => (
                  <PayoutCard key={payout.label} payout={payout} />
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
