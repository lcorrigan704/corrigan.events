import { FormEvent, useMemo, useState } from "react";
import { format } from "date-fns";
import { CalendarClock, ChevronDownIcon, Plus, Sparkles, Trash2 } from "lucide-react";
import { createSweepstake } from "../lib/api";
import { corePayoutCategories, hasPayout, optionalPayoutCategories, payoutLabels, toggleOptionalPayout, updatePayoutPercentage, type PayoutInput } from "../lib/payouts";
import { formatGBP, toPence } from "../lib/utils";
import type { CreatedSweepstake } from "../types";
import { Button } from "./ui/button";
import { Calendar } from "./ui/calendar";
import { Card, CardContent, CardHeader } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

type ParticipantRow = {
  id: string;
  name: string;
  slotsCount: number;
};

const defaultPayouts: PayoutInput[] = [
  { category: "champion" as const, percentage: 70 },
  { category: "runner_up" as const, percentage: 20 },
  { category: "third_place" as const, percentage: 10 }
];

const WORLD_CUP_ITEM_COUNT = 48;
const primaryAddButtonClass = "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground";

function createClientId() {
  if (crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `participant-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function defaultParticipants(): ParticipantRow[] {
  return Array.from({ length: 48 }, (_, index) => ({
    id: createClientId(),
    name: "",
    slotsCount: 1
  }));
}

function participantPlaceholder(index: number) {
  return `Participant ${index + 1}`;
}

function defaultRevealDate() {
  return new Date(Date.now() + 60 * 60 * 1000);
}

function timeValue(date: Date) {
  return date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Europe/London"
  });
}

function revealDateTimeIso(date: Date | undefined, time: string) {
  const selectedDate = date ?? defaultRevealDate();
  const [hours, minutes, seconds] = time.split(":").map((part) => Number.parseInt(part, 10));
  const revealDateTime = new Date(selectedDate);
  revealDateTime.setHours(hours || 0, minutes || 0, seconds || 0, 0);
  return revealDateTime.toISOString();
}

export function CreateSweepstake({ onCreated }: { onCreated: (created: CreatedSweepstake) => void }) {
  const initialRevealDate = defaultRevealDate();
  const [title, setTitle] = useState("World Cup 2026 Sweepstake");
  const [organiserEmail, setOrganiserEmail] = useState("");
  const [buyIn, setBuyIn] = useState("5");
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [revealDate, setRevealDate] = useState<Date | undefined>(initialRevealDate);
  const [revealTime, setRevealTime] = useState(timeValue(initialRevealDate));
  const [participants, setParticipants] = useState<ParticipantRow[]>(defaultParticipants);
  const [payouts, setPayouts] = useState(defaultPayouts);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const slotCount = useMemo(
    () =>
      participants
        .reduce((sum, participant) => sum + Math.max(0, participant.slotsCount), 0),
    [participants]
  );
  const namedParticipantCount = useMemo(
    () => participants.filter((participant) => participant.name.trim()).length,
    [participants]
  );
  const namedSlotCount = useMemo(
    () =>
      participants
        .filter((participant) => participant.name.trim())
        .reduce((sum, participant) => sum + Math.max(0, participant.slotsCount), 0),
    [participants]
  );
  const itemCount = WORLD_CUP_ITEM_COUNT;
  const remainingSlots = itemCount - namedSlotCount;
  const pot = namedSlotCount * toPence(buyIn);
  const payoutTotal = payouts.reduce((sum, term) => sum + term.percentage, 0);
  const organiserEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(organiserEmail.trim());
  const canSubmit = payoutTotal === 100 && slotCount <= itemCount && organiserEmailValid;

  function updateParticipantSlots(participantId: string, requestedValue: string) {
    const requestedSlots = Math.max(1, Number.parseInt(requestedValue || "1", 10));
    const currentParticipant = participants.find((participant) => participant.id === participantId);
    if (!currentParticipant) return;

    const otherSlotCount = slotCount - currentParticipant.slotsCount;
    const maxForParticipant = Math.max(1, itemCount - otherSlotCount);
    const nextSlotsCount = Math.min(requestedSlots, maxForParticipant);

    setParticipants(
      participants.map((row) => (row.id === participantId ? { ...row, slotsCount: nextSlotsCount } : row))
    );
  }

  function addParticipant() {
    if (slotCount >= itemCount) return;
    setParticipants([...participants, { id: createClientId(), name: "", slotsCount: 1 }]);
  }

  function updateParticipantName(participantId: string, name: string) {
    setParticipants(participants.map((row) => (row.id === participantId ? { ...row, name } : row)));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (slotCount > itemCount) {
      setError(`You can only create ${itemCount} slots for this draw.`);
      return;
    }
    setLoading(true);
    try {
      const payload = {
        title,
        organiser_email: organiserEmail.trim().toLowerCase(),
        template_type: "world_cup_2026",
        buy_in_pence: toPence(buyIn),
        reveal_at: revealDateTimeIso(revealDate, revealTime),
        participants: participants
          .filter((participant) => participant.name.trim() && participant.slotsCount > 0)
          .map((participant) => ({
            name: participant.name.trim(),
            slots_count: participant.slotsCount,
            paid: true
          })),
        payouts
      };
      onCreated(await createSweepstake(payload));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create sweepstake");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <Sparkles className="h-5 w-5 text-primary" />
          <div>
            <h2 className="text-xl font-black">Create a Sweepstake</h2>
            <p className="text-sm text-muted-foreground">Add each participant once, then set how many paid slots they bought.</p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input value={title} onChange={(event) => setTitle(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="organiser-email">Organiser email</Label>
              <Input
                id="organiser-email"
                type="email"
                value={organiserEmail}
                required
                placeholder="you@example.com"
                onChange={(event) => setOrganiserEmail(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <div className="grid gap-2 sm:grid-cols-[1fr_132px]">
                <div className="space-y-2">
                  <Label htmlFor="reveal-date">Date</Label>
                  <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        id="reveal-date"
                        className="w-full justify-between font-normal"
                      >
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
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reveal-time">Time UK</Label>
                  <Input
                    type="time"
                    id="reveal-time"
                    step="1"
                    value={revealTime}
                    onChange={(event) => setRevealTime(event.target.value)}
                    className="appearance-none bg-background [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
                  />
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Buy-in GBP</Label>
              <Input value={buyIn} onChange={(event) => setBuyIn(event.target.value)} inputMode="decimal" />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <span className="text-sm text-muted-foreground">Participants</span>

              </div>
              <Button
                type="button"
                variant="default"
                className={primaryAddButtonClass}
                disabled={slotCount >= itemCount}
                onClick={addParticipant}
              >
                <Plus className="h-4 w-4" />
                Add Participant
              </Button>
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
                    max={Math.max(1, itemCount - (slotCount - participant.slotsCount))}
                    onChange={(event) => updateParticipantSlots(participant.id, event.target.value)}
                  />
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    className="size-9"
                    disabled={participants.length === 1}
                    aria-label={`Remove ${participant.name || "participant"}`}
                    onClick={() => setParticipants(participants.filter((row) => row.id !== participant.id))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Payout terms</span>
            </div>
            {corePayoutCategories.map((category) => {
              const payout = payouts.find((term) => term.category === category);
              if (!payout) return null;
              return (
              <div key={category} className="grid grid-cols-[minmax(0,1fr)_72px] gap-2 sm:grid-cols-[1fr_120px]">
                <div className="flex h-9 items-center rounded-md border bg-background px-3 text-sm font-medium">{payoutLabels[category]}</div>
                <Input
                  className="min-w-0"
                  value={payout.percentage}
                  type="number"
                  min={0}
                  max={100}
                  onChange={(event) =>
                    setPayouts(
                      updatePayoutPercentage(payouts, category, Number.parseInt(event.target.value || "0", 10))
                    )
                  }
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
                  <label key={category} className="grid min-h-9 grid-cols-[minmax(0,1fr)_72px] items-center gap-2 text-sm sm:grid-cols-[1fr_120px]">
                    <span className="flex min-w-0 items-center gap-2 font-medium">
                      <input
                        type="checkbox"
                        checked={enabled}
                        onChange={() => setPayouts(toggleOptionalPayout(payouts, category))}
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
                        onChange={(event) =>
                          setPayouts(updatePayoutPercentage(payouts, category, Number.parseInt(event.target.value || "0", 10)))
                        }
                      />
                    )}
                    {!enabled && <div />}
                  </label>
                );
              })}
            </div>
          </div>

          <div className="grid gap-3 rounded-md border bg-muted p-4 sm:grid-cols-3">
            <div>
              <div className="text-xs uppercase text-muted-foreground">Slots</div>
              <div className={namedSlotCount === itemCount ? "text-2xl font-black" : "text-2xl font-black text-destructive"}>
                {namedSlotCount}/{itemCount}
              </div>
              <div className="text-xs text-muted-foreground">{namedParticipantCount} participants</div>
              {remainingSlots !== 0 && (
                <div className="text-xs text-destructive">
                  {remainingSlots > 0 ? `${remainingSlots} named slots still needed` : `${Math.abs(remainingSlots)} slots over limit`}
                </div>
              )}
            </div>
            <div>
              <div className="text-xs uppercase text-muted-foreground">Pot</div>
              <div className="text-2xl font-black">{formatGBP(pot)}</div>
            </div>
            <div>
              <div className="text-xs uppercase text-muted-foreground">Payout total</div>
              <div className={payoutTotal === 100 ? "text-2xl font-black" : "text-2xl font-black text-destructive"}>
                {payoutTotal}%
              </div>
            </div>
          </div>

          {error && <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
          <Button type="submit" disabled={loading || !canSubmit}>
            <CalendarClock className="h-4 w-4" />
            {loading ? "Creating..." : "Create Draft"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
