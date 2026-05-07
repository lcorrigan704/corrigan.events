import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import NumberFlow, { NumberFlowGroup } from "@number-flow/react";
import { AnimatePresence, motion } from "motion/react";
import { flagForItem, homeKitForItem } from "../lib/teams";
import type { Slot, Sweepstake } from "../types";
import { ShimmeringText } from "./animate-ui/primitives/texts/shimmering";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { AnimatedList } from "./ui/animated-list";

const revealSteps = [
  { message: "Generating seed", startProgress: 0, endProgress: 32, startTime: 0, endTime: 2_250 },
  { message: "Creating groups", startProgress: 32, endProgress: 79, startTime: 2_250, endTime: 5_550 },
  { message: "Finalising standings", startProgress: 79, endProgress: 100, startTime: 5_550, endTime: 7_000 },
];
const revealDuration = revealSteps[revealSteps.length - 1].endTime;
const lockedMessages = ["Results ready in", "Draw locked", "Reveal pending"];
const liveDrawDelay = 800;

type ReplayPhase = "countdown" | "preparing" | "drawing";

type TeamCardStyle = CSSProperties & {
  "--team-primary": string;
  "--team-secondary": string;
  "--team-text": string;
};

function countdownParts(milliseconds: number) {
  const secondsRemaining = Math.max(0, Math.floor(milliseconds / 1000));
  const days = Math.floor(secondsRemaining / 86_400);
  const tickerSeconds = secondsRemaining % 86_400;

  return { days, tickerSeconds };
}

function NumberTicker({ seconds }: { seconds: number }) {
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const remainingSeconds = seconds % 60;

  return (
    <div className="inline-flex items-center gap-2 text-5xl font-black leading-none tracking-normal tabular-nums sm:text-7xl lg:text-8xl">
      <NumberFlowGroup>
        <NumberFlow value={hours} format={{ minimumIntegerDigits: 2 }} />
        <span>:</span>
        <NumberFlow value={minutes} format={{ minimumIntegerDigits: 2 }} />
        <span>:</span>
        <NumberFlow value={remainingSeconds} format={{ minimumIntegerDigits: 2 }} />
      </NumberFlowGroup>
    </div>
  );
}

function revealProgress(elapsed: number) {
  const step = revealSteps.find((candidate) => elapsed <= candidate.endTime) ?? revealSteps[revealSteps.length - 1];
  const stepElapsed = Math.max(0, elapsed - step.startTime);
  const stepDuration = step.endTime - step.startTime;
  const stepProgress = Math.min(1, stepElapsed / stepDuration);
  const progress = step.startProgress + (step.endProgress - step.startProgress) * stepProgress;

  return {
    message: step.message,
    progress: Math.min(100, Math.round(progress)),
  };
}

function LiveDrawCard({ slot }: { slot: Slot }) {
  const item = slot.assigned_item;
  if (!item) return null;

  const kit = homeKitForItem(item);

  return (
    <div
      className="relative overflow-hidden rounded-md border p-3 text-left shadow-sm sm:p-4"
      style={{
        "--team-primary": kit.primary,
        "--team-secondary": kit.secondary,
        "--team-text": kit.text,
        color: "var(--team-text)",
        background:
          "linear-gradient(135deg, color-mix(in srgb, var(--team-primary) 92%, black 8%) 0 68%, var(--team-secondary) 68% 100%)",
      } as TeamCardStyle}
    >
      <div className="absolute inset-0 bg-gradient-to-r from-black/10 via-transparent to-white/10" />
      {item.group_name ? (
        <div className="absolute right-3 top-3 rounded-md border border-black/10 bg-white/85 px-2 py-1 text-xs font-black text-black shadow-sm">
          Group {item.group_name}
        </div>
      ) : null}
      <div className="relative flex min-w-0 items-center gap-3">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-md border border-black/10 bg-white/85 text-2xl shadow-sm sm:size-14 sm:text-3xl">
          {flagForItem(item)}
        </div>
        <div className="min-w-0 flex-1 pr-20">
          <div className="truncate text-xl font-black leading-tight sm:text-3xl">{slot.name}</div>
          <div className="mt-1 truncate text-sm font-semibold opacity-90 sm:text-base">{item.name}</div>
        </div>
      </div>
    </div>
  );
}

function LiveDrawReplay({
  sweepstake,
  assignments,
  revealedCount,
  onViewDetails,
}: {
  sweepstake: Sweepstake;
  assignments: Slot[];
  revealedCount: number;
  onViewDetails: () => void;
}) {
  return (
    <div className="flex min-h-[calc(100vh-3rem)] items-center justify-center">
      <Card className="w-full max-w-4xl overflow-hidden">
        <CardContent className="p-4 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <Badge variant="secondary">{sweepstake.title}</Badge>
              <h1 className="mt-4 text-3xl font-black tracking-normal sm:text-5xl">Live draw</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {Math.min(revealedCount, assignments.length)} of {assignments.length} revealed
              </p>
            </div>
            <Button type="button" variant="link" className="px-0 text-muted-foreground hover:text-foreground" onClick={onViewDetails}>
              View draw details
            </Button>
          </div>

          <div className="relative mt-5 overflow-hidden">
            <div className="h-[min(68vh,720px)] overflow-y-auto pr-1 [mask-image:linear-gradient(to_bottom,black_0%,black_72%,rgba(0,0,0,0.55)_86%,transparent_100%)] [mask-size:100%_100%]">
              <AnimatedList delay={liveDrawDelay} className="gap-3 pb-16">
                {assignments.map((slot) => (
                  <LiveDrawCard key={slot.id} slot={slot} />
                ))}
              </AnimatedList>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function DrawReplay({
  sweepstake,
  onRevealReady,
  onRevealUnlocked,
  startInReplay = false,
}: {
  sweepstake: Sweepstake;
  onRevealReady: () => void;
  onRevealUnlocked: () => Promise<Sweepstake | null>;
  startInReplay?: boolean;
}) {
  const revealAt = useMemo(() => new Date(sweepstake.reveal_at).getTime(), [sweepstake.reveal_at]);
  const [replaySweepstake, setReplaySweepstake] = useState(sweepstake);
  const assignments = useMemo(() => replaySweepstake.slots.filter((slot) => slot.paid && slot.assigned_item), [replaySweepstake.slots]);
  const [now, setNow] = useState(Date.now());
  const [progress, setProgress] = useState(0);
  const [revealMessage, setRevealMessage] = useState(revealSteps[0].message);
  const [lockedMessageIndex, setLockedMessageIndex] = useState(0);
  const [phase, setPhase] = useState<ReplayPhase>(() => {
    if (startInReplay && sweepstake.slots.some((slot) => slot.paid && slot.assigned_item)) {
      return "drawing";
    }
    return revealAt - Date.now() <= 0 ? "preparing" : "countdown";
  });
  const [revealedCount, setRevealedCount] = useState(0);
  const completedRef = useRef(false);

  const finishReveal = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    onRevealReady();
  }, [onRevealReady]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setLockedMessageIndex((index) => (index + 1) % lockedMessages.length);
    }, 3_000);
    return () => window.clearInterval(interval);
  }, []);

  const millisecondsRemaining = revealAt - now;
  const isPreparingReveal = phase === "preparing";
  const { days, tickerSeconds } = countdownParts(millisecondsRemaining);

  useEffect(() => {
    if (sweepstake.draw_status === "draft") {
      return;
    }
    if (phase !== "countdown") {
      return;
    }
    if (millisecondsRemaining > 0) {
      setProgress(0);
      setRevealMessage(revealSteps[0].message);
      return;
    }
    setPhase("preparing");
  }, [millisecondsRemaining, phase, sweepstake.draw_status]);

  useEffect(() => {
    if (sweepstake.draw_status === "draft" || phase !== "preparing") {
      return;
    }
    const startedAt = Date.now();
    const interval = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const next = revealProgress(elapsed);

      setProgress(next.progress);
      setRevealMessage(next.message);

      if (elapsed >= revealDuration) {
        window.clearInterval(interval);
        setProgress(100);
        onRevealUnlocked().then((revealedSweepstake) => {
          if (revealedSweepstake) {
            setReplaySweepstake(revealedSweepstake);
            const revealedAssignments = revealedSweepstake.slots.filter((slot) => slot.paid && slot.assigned_item);
            if (revealedAssignments.length > 0) {
              setPhase("drawing");
              return;
            }
          }
          finishReveal();
        });
      }
    }, 120);

    return () => window.clearInterval(interval);
  }, [finishReveal, onRevealUnlocked, phase, sweepstake.draw_status]);

  useEffect(() => {
    if (phase !== "drawing") {
      return;
    }

    setRevealedCount(1);
    const countInterval = window.setInterval(() => {
      setRevealedCount((count) => Math.min(assignments.length, count + 1));
    }, liveDrawDelay);

    return () => {
      window.clearInterval(countInterval);
    };
  }, [assignments.length, phase]);

  if (sweepstake.draw_status === "draft") {
    return (
      <div className="flex min-h-[calc(100vh-3rem)] items-center justify-center">
        <Card className="w-full max-w-4xl">
          <CardContent className="p-6 text-center sm:p-10">
            <Badge>Draw not published</Badge>
            <h1 className="mt-5 text-3xl font-black tracking-normal sm:text-5xl">The draw is still being set up</h1>
            <p className="mx-auto mt-4 max-w-xl text-sm text-muted-foreground">
              The organiser is still filling participant slots. Check back once the draw has been published.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (phase === "drawing") {
    return <LiveDrawReplay sweepstake={replaySweepstake} assignments={assignments} revealedCount={revealedCount} onViewDetails={finishReveal} />;
  }

  return (
    <div className="flex min-h-[calc(100vh-3rem)] items-center justify-center">
      <Card className="w-full max-w-4xl">
        <CardContent className="p-6 text-center sm:p-10">
          <Badge>Draw locked</Badge>
          {isPreparingReveal ? (
            <>
              <div className="mt-5">
                <Badge variant="secondary">{sweepstake.title}</Badge>
              </div>
              <h1 className="mt-4 min-h-[1.2em] text-2xl font-black tracking-normal sm:text-5xl">
                <AnimatePresence mode="wait">
                  <motion.span
                    key={revealMessage}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.22, ease: "easeOut" }}
                    className="inline-block whitespace-nowrap"
                  >
                    <ShimmeringText
                      text={revealMessage}
                      wave={false}
                      duration={0.9}
                      color="var(--foreground)"
                      shimmeringColor="var(--muted-foreground)"
                    />
                  </motion.span>
                </AnimatePresence>
              </h1>
              <div className="mx-auto mt-5 max-w-xl">
                <div className="h-3 overflow-hidden rounded-md border bg-muted">
                  <div className="h-full rounded-md bg-primary transition-all duration-150" style={{ width: `${progress}%` }} />
                </div>
                <div className="mt-3 text-sm text-muted-foreground">{progress}%</div>
              </div>
            </>
          ) : (
            <>
              <div className="mt-5">
                <Badge variant="secondary">{sweepstake.title}</Badge>
              </div>
              <h1 className="mt-4 min-h-[1.2em] text-2xl font-black tracking-normal sm:text-5xl">
                <AnimatePresence mode="wait">
                  <motion.span
                    key={lockedMessages[lockedMessageIndex]}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.22, ease: "easeOut" }}
                    className="inline-block whitespace-nowrap"
                  >
                    <ShimmeringText
                      text={lockedMessages[lockedMessageIndex]}
                      wave={false}
                      duration={0.9}
                      color="var(--foreground)"
                      shimmeringColor="var(--muted-foreground)"
                    />
                  </motion.span>
                </AnimatePresence>
              </h1>
              <div className="mt-4">
                {days > 0 && (
                  <div className="mb-3 text-sm font-medium uppercase text-muted-foreground">
                    {days} {days === 1 ? "day" : "days"} plus
                  </div>
                )}
                <NumberTicker seconds={tickerSeconds} />
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
