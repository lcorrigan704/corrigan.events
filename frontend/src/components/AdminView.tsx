import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Check, ChevronDownIcon, Copy, ExternalLink, Plus, Rocket, Save, Trash2 } from "lucide-react";
import { getAdmin, publishSweepstake, updateAdminParticipants, updateAdminSettings } from "../lib/api";
import type { CreatedSweepstake, PayoutCategory, Slot, Sweepstake } from "../types";
import { corePayoutCategories, hasPayout, optionalPayoutCategories, payoutLabels, toggleOptionalPayout, updatePayoutPercentage } from "../lib/payouts";
import { formatGBP, toPence } from "../lib/utils";
import { AssignmentTable } from "./AssignmentTable";
import { KnockoutBracket } from "./KnockoutBracket";
import { SummaryStrip } from "./SummaryStrip";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Calendar } from "./ui/calendar";
import { Card, CardContent } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "./ui/sheet";

const WORLD_CUP_ITEM_COUNT = 48;

type ParticipantRow = {
  id: string;
  name: string;
  slotsCount: number;
};

type PayoutRow = {
  category: PayoutCategory;
  percentage: number;
};

function createClientId() {
  if (crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `participant-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function participantPlaceholder(index: number) {
  return `Participant ${index + 1}`;
}

function isGeneratedParticipantName(name: string) {
  return /^Participant \d+$/i.test(name.trim());
}

function defaultParticipants(): ParticipantRow[] {
  return Array.from({ length: WORLD_CUP_ITEM_COUNT }, () => ({
    id: createClientId(),
    name: "",
    slotsCount: 1,
  }));
}

function participantsFromSlots(slots: Slot[]): ParticipantRow[] {
  if (slots.length === 0) {
    return defaultParticipants();
  }

  const grouped = new Map<string, ParticipantRow>();
  for (const [index, slot] of slots.entries()) {
    const slotName = isGeneratedParticipantName(slot.name) ? "" : slot.name;
    const key = slotName.trim() ? slotName.trim().toLowerCase() : `empty-${index}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.slotsCount += 1;
    } else {
      grouped.set(key, {
        id: createClientId(),
        name: slotName,
        slotsCount: 1,
      });
    }
  }
  return Array.from(grouped.values());
}

function participantPayload(participants: ParticipantRow[]) {
  return participants
    .filter((participant) => participant.name.trim())
    .map((participant) => ({
      name: participant.name.trim(),
      slots_count: Number.isFinite(participant.slotsCount) ? Math.max(1, Math.floor(participant.slotsCount)) : 1,
      paid: true,
    }));
}

function namedSlotCount(participants: ParticipantRow[]) {
  return participantPayload(participants).reduce((sum, participant) => sum + participant.slots_count, 0);
}

function timeValue(date: Date) {
  return date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Europe/London",
  });
}

function revealDateTimeIso(date: Date | undefined, time: string) {
  const selectedDate = date ?? new Date();
  const [hours, minutes, seconds] = time.split(":").map((part) => Number.parseInt(part, 10));
  const revealDateTime = new Date(selectedDate);
  revealDateTime.setHours(hours || 0, minutes || 0, seconds || 0, 0);
  return revealDateTime.toISOString();
}

function tokenFromPath() {
  const match = window.location.pathname.match(/\/admin\/(.+)$/);
  return match?.[1] ?? "";
}

export function AdminView({ created }: { created?: CreatedSweepstake }) {
  const adminParts = created?.admin_url.split("/");
  const [token] = useState(adminParts ? adminParts[adminParts.length - 1] : tokenFromPath());
  const [sweepstake, setSweepstake] = useState<Sweepstake | null>(created?.sweepstake ?? null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!sweepstake && token) {
      getAdmin(token)
        .then(setSweepstake)
        .catch((caught) => setError(caught instanceof Error ? caught.message : "Could not load admin view"));
    }
  }, [sweepstake, token]);

  if (error) return <div className="rounded-md border border-destructive bg-destructive/10 p-5 text-destructive">{error}</div>;
  if (!sweepstake) return <Card><CardContent className="p-5">Loading admin view...</CardContent></Card>;

  async function copyParticipantLink() {
    if (!sweepstake) return;
    await navigator.clipboard.writeText(sweepstake.share_url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="space-y-5">
      <Card className="border-primary/20 bg-accent">
        <CardContent className="p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <Badge>Organiser</Badge>
            <h1 className="mt-3 text-3xl font-black">{sweepstake.title}</h1>
            <p className="mt-2 text-muted-foreground">Keep this admin URL private. Share only the participant code or link.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={copyParticipantLink}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied" : `Copy ${sweepstake.view_code}`}
            </Button>
            <Button type="button" variant="default" onClick={() => window.open(sweepstake.share_url, "_blank")}>
              <ExternalLink className="h-4 w-4" />
              Open View
            </Button>
          </div>
        </div>
        </CardContent>
      </Card>

      <SummaryStrip sweepstake={sweepstake} />

      {sweepstake.draw_status === "draft" && (
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <DraftSettingsEditor token={token} sweepstake={sweepstake} onUpdate={setSweepstake} onError={setError} />
          <DraftParticipantEditor token={token} sweepstake={sweepstake} onUpdate={setSweepstake} onError={setError} />
        </div>
      )}

      <div className="grid w-full min-w-0 max-w-full items-start gap-5 xl:grid-cols-[minmax(390px,1.15fr)_minmax(0,2.85fr)]">
        <AssignmentTable sweepstake={sweepstake} showAssignments={sweepstake.is_revealed} />
        <KnockoutBracket sweepstake={sweepstake} />
      </div>
    </div>
  );
}

function DraftSettingsEditor({
  token,
  sweepstake,
  onUpdate,
  onError,
}: {
  token: string;
  sweepstake: Sweepstake;
  onUpdate: (sweepstake: Sweepstake) => void;
  onError: (message: string | null) => void;
}) {
  const initialRevealDate = new Date(sweepstake.reveal_at);
  const [buyIn, setBuyIn] = useState(String(sweepstake.buy_in_pence / 100));
  const [revealDate, setRevealDate] = useState<Date | undefined>(initialRevealDate);
  const [revealTime, setRevealTime] = useState(timeValue(initialRevealDate));
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [payouts, setPayouts] = useState<PayoutRow[]>(
    sweepstake.payouts.map((payout) => ({ category: payout.category, percentage: payout.percentage }))
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const payoutTotal = payouts.reduce((sum, payout) => sum + payout.percentage, 0);
  const canSave = payoutTotal === 100;

  async function saveSettings() {
    setSaving(true);
    onError(null);
    try {
      const updated = await updateAdminSettings(token, {
        buy_in_pence: toPence(buyIn),
        reveal_at: revealDateTimeIso(revealDate, revealTime),
        payouts: payouts.map((payout) => ({
          category: payout.category,
          percentage: Number.isFinite(payout.percentage) ? payout.percentage : 0,
        })),
      });
      onUpdate(updated);
      setSaved(true);
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : "Could not save draw settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Badge variant="secondary">Draft settings</Badge>
            <h2 className="mt-2 text-xl font-black">Draw details</h2>
            <p className="mt-1 text-sm text-muted-foreground">Edit these before publishing the draw.</p>
          </div>
          <Button type="button" variant="secondary" disabled={saving || !canSave} onClick={saveSettings}>
            <Save className="h-4 w-4" />
            {saving ? "Saving..." : saved ? "Saved" : "Save Settings"}
          </Button>
        </div>

        <div className="grid items-start gap-3 md:grid-cols-[minmax(160px,0.9fr)_minmax(0,1.5fr)_minmax(132px,0.9fr)]">
          <div className="space-y-2">
            <Label>Buy-in GBP</Label>
            <Input
              value={buyIn}
              inputMode="decimal"
              className="w-full"
              onChange={(event) => {
                setBuyIn(event.target.value);
                setSaved(false);
              }}
            />
            <p className="text-xs text-muted-foreground">Current pot: {formatGBP(sweepstake.slots.length * toPence(buyIn))}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="admin-reveal-date">Date</Label>
            <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" id="admin-reveal-date" className="w-full justify-between font-normal">
                  {revealDate ? format(revealDate, "PPP") : "Select date"}
                  <ChevronDownIcon />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto overflow-hidden p-0" align="start">
                <Calendar
                  mode="single"
                  selected={revealDate}
                  captionLayout="dropdown"
                  defaultMonth={revealDate}
                  onSelect={(date) => {
                    setRevealDate(date);
                    setDatePickerOpen(false);
                    setSaved(false);
                  }}
                />
              </PopoverContent>
            </Popover>
          </div>
          <div className="space-y-2">
            <Label htmlFor="admin-reveal-time">Time UK</Label>
            <Input
              type="time"
              id="admin-reveal-time"
              step="1"
              value={revealTime}
              onChange={(event) => {
                setRevealTime(event.target.value);
                setSaved(false);
              }}
              className="appearance-none bg-background [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
            />
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium">Payout terms</div>
              <div className={payoutTotal === 100 ? "text-xs text-muted-foreground" : "text-xs text-destructive"}>
                Total: {payoutTotal}%
              </div>
            </div>
          </div>
          {corePayoutCategories.map((category) => {
            const payout = payouts.find((term) => term.category === category);
            if (!payout) return null;
            return (
            <div key={category} className="grid grid-cols-[minmax(0,1fr)_72px] gap-2">
              <div className="flex h-9 items-center rounded-md border bg-background px-3 text-sm font-medium">{payoutLabels[category]}</div>
              <Input
                className="min-w-0"
                value={payout.percentage}
                type="number"
                min={0}
                max={100}
                onChange={(event) => {
                  setPayouts(
                    updatePayoutPercentage(payouts, category, Number.parseInt(event.target.value || "0", 10))
                  );
                  setSaved(false);
                }}
              />
            </div>
            );
          })}
          <div className="space-y-2 pt-1">
            {optionalPayoutCategories.map((category) => {
              const enabled = hasPayout(payouts, category);
              const payout = payouts.find((term) => term.category === category);
              const label = payoutLabels[category];

              return (
                <label key={category} className="grid min-h-9 grid-cols-[minmax(0,1fr)_72px] items-center gap-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2 font-medium">
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={() => {
                        setPayouts(toggleOptionalPayout(payouts, category));
                        setSaved(false);
                      }}
                      className="h-4 w-4 accent-primary"
                    />
                    {label}
                  </span>
                  {enabled && (
                    <Input
                      aria-label={`${label} payout percentage`}
                      className="h-8 min-w-0"
                    value={payout?.percentage ?? 0}
                      type="number"
                      min={0}
                      max={100}
                      onChange={(event) => {
                        setPayouts(updatePayoutPercentage(payouts, category, Number.parseInt(event.target.value || "0", 10)));
                        setSaved(false);
                      }}
                    />
                  )}
                  {!enabled && <div />}
                </label>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DraftParticipantEditor({
  token,
  sweepstake,
  onUpdate,
  onError,
}: {
  token: string;
  sweepstake: Sweepstake;
  onUpdate: (sweepstake: Sweepstake) => void;
  onError: (message: string | null) => void;
}) {
  const [participants, setParticipants] = useState<ParticipantRow[]>(() => participantsFromSlots(sweepstake.slots));
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const slotCount = useMemo(
    () => participants.reduce((sum, participant) => sum + Math.max(0, participant.slotsCount), 0),
    [participants]
  );
  const namedParticipants = participantPayload(participants);
  const filledSlotCount = namedSlotCount(participants);
  const namedParticipantCount = namedParticipants.length;
  const canPublish = filledSlotCount === WORLD_CUP_ITEM_COUNT;

  function updateParticipantName(participantId: string, name: string) {
    setParticipants(participants.map((row) => (row.id === participantId ? { ...row, name } : row)));
    setSaved(false);
  }

  function updateParticipantSlots(participantId: string, requestedValue: string) {
    const requestedSlots = Math.max(1, Number.parseInt(requestedValue || "1", 10));
    const currentParticipant = participants.find((participant) => participant.id === participantId);
    if (!currentParticipant) return;
    const otherSlotCount = slotCount - currentParticipant.slotsCount;
    const maxForParticipant = Math.max(1, WORLD_CUP_ITEM_COUNT - otherSlotCount);
    const nextSlotsCount = Math.min(requestedSlots, maxForParticipant);
    setParticipants(participants.map((row) => (row.id === participantId ? { ...row, slotsCount: nextSlotsCount } : row)));
    setSaved(false);
  }

  async function saveParticipants() {
    setSaving(true);
    onError(null);
    try {
      const updated = await updateAdminParticipants(
        token,
        participantPayload(participants)
      );
      onUpdate(updated);
      setSaved(true);
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : "Could not save participants");
    } finally {
      setSaving(false);
    }
  }

  async function publish() {
    setPublishing(true);
    onError(null);
    try {
      const savedSweepstake = await updateAdminParticipants(
        token,
        participantPayload(participants)
      );
      onUpdate(savedSweepstake);
      const published = await publishSweepstake(token);
      onUpdate(published);
      setConfirmOpen(false);
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : "Could not publish draw");
    } finally {
      setPublishing(false);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Badge variant="secondary">Draft</Badge>
            <h2 className="mt-2 text-xl font-black">Fill participant slots</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Save this draft now, then publish once all {WORLD_CUP_ITEM_COUNT} slots have names.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={slotCount >= WORLD_CUP_ITEM_COUNT}
              onClick={() => {
                setParticipants([...participants, { id: createClientId(), name: "", slotsCount: 1 }]);
                setSaved(false);
              }}
            >
              <Plus className="h-4 w-4" />
              Add Participant
            </Button>
            <Button type="button" variant="secondary" disabled={saving} onClick={saveParticipants}>
              <Save className="h-4 w-4" />
              {saving ? "Saving..." : saved ? "Saved" : "Save Draft"}
            </Button>
            <Button type="button" disabled={!canPublish || publishing} onClick={() => setConfirmOpen(true)}>
              <Rocket className="h-4 w-4" />
              Publish Draw
            </Button>
          </div>
        </div>

        <div className="rounded-md border bg-muted p-3">
          <div className={canPublish ? "text-sm font-semibold" : "text-sm font-semibold text-destructive"}>
            {filledSlotCount}/{WORLD_CUP_ITEM_COUNT} named slots filled
          </div>
          {!canPublish && (
            <div className="mt-1 text-xs text-muted-foreground">
              {WORLD_CUP_ITEM_COUNT - filledSlotCount} more named slots required before publishing.
            </div>
          )}
        </div>

        <div className="max-h-96 space-y-2 overflow-y-auto rounded-md border bg-card p-2 sm:p-3">
          {participants.map((participant, index) => (
            <div key={participant.id} className="grid grid-cols-[32px_minmax(0,1fr)_56px_36px] gap-2 sm:grid-cols-[48px_1fr_120px_44px]">
              <div className="flex h-8 items-center justify-center rounded-md border bg-card text-sm text-muted-foreground">
                {index + 1}
              </div>
              <Input
                className="min-w-0"
                value={participant.name}
                placeholder={participantPlaceholder(index)}
                onChange={(event) => updateParticipantName(participant.id, event.target.value)}
              />
              <Input
                aria-label={`${participant.name || "Participant"} slot count`}
                className="min-w-0"
                value={participant.slotsCount}
                type="number"
                min={1}
                max={Math.max(1, WORLD_CUP_ITEM_COUNT - (slotCount - participant.slotsCount))}
                onChange={(event) => updateParticipantSlots(participant.id, event.target.value)}
              />
              <Button
                type="button"
                variant="destructive"
                size="icon"
                className="size-9"
                disabled={participants.length === 1}
                aria-label={`Remove ${participant.name || "participant"}`}
                onClick={() => {
                  setParticipants(participants.filter((row) => row.id !== participant.id));
                  setSaved(false);
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>

        <Sheet open={confirmOpen} onOpenChange={setConfirmOpen}>
          <SheetContent side="bottom" className="mx-auto max-h-[90vh] max-w-3xl rounded-t-md border-x p-0">
            <SheetHeader className="border-b p-5 text-left">
              <SheetTitle className="text-2xl font-black">Are you ready?</SheetTitle>
              <SheetDescription>
                Publishing locks the participant list and generates the random team assignments.
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-4 overflow-y-auto p-5">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-md border bg-muted p-3">
                  <div className="text-xs uppercase text-muted-foreground">Participants</div>
                  <div className="mt-1 text-2xl font-black">{namedParticipantCount}</div>
                </div>
                <div className="rounded-md border bg-muted p-3">
                  <div className="text-xs uppercase text-muted-foreground">Slots</div>
                  <div className="mt-1 text-2xl font-black">{filledSlotCount}/{WORLD_CUP_ITEM_COUNT}</div>
                </div>
                <div className="rounded-md border bg-muted p-3">
                  <div className="text-xs uppercase text-muted-foreground">Reveal</div>
                  <div className="mt-1 text-sm font-semibold">
                    {format(new Date(sweepstake.reveal_at), "PPp")}
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-md border p-3">
                  <div className="text-xs uppercase text-muted-foreground">Buy-in</div>
                  <div className="mt-1 text-2xl font-black">{formatGBP(sweepstake.buy_in_pence)}</div>
                  <div className="mt-1 text-xs text-muted-foreground">Total pot {formatGBP(filledSlotCount * sweepstake.buy_in_pence)}</div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-xs uppercase text-muted-foreground">Participant code</div>
                  <div className="mt-1 text-2xl font-black tracking-normal">{sweepstake.view_code}</div>
                </div>
              </div>

              <div className="rounded-md border p-3">
                <div className="mb-3 text-xs uppercase text-muted-foreground">Payout rules</div>
                <div className="space-y-2">
                  {sweepstake.payouts.map((payout) => (
                    <div key={payout.label} className="flex items-center justify-between gap-3 rounded-md border bg-muted px-3 py-2">
                      <div>
                        <div className="font-semibold">{payout.label}</div>
                        <div className="text-xs text-muted-foreground">{payout.percentage}%</div>
                      </div>
                      <div className="font-black">{formatGBP(Math.round((filledSlotCount * sweepstake.buy_in_pence * payout.percentage) / 100))}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <SheetFooter className="border-t p-5 sm:flex-row sm:justify-end">
              <SheetClose asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </SheetClose>
              <Button type="button" disabled={!canPublish || publishing} onClick={publish}>
                <Rocket className="h-4 w-4" />
                {publishing ? "Publishing..." : "Publish Draw"}
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      </CardContent>
    </Card>
  );
}
