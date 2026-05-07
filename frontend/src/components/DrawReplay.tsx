import { useEffect, useMemo, useState } from "react";
import NumberFlow, { NumberFlowGroup } from "@number-flow/react";
import { AnimatePresence, motion } from "motion/react";
import { ShimmeringText } from "./animate-ui/primitives/texts/shimmering";
import { Badge } from "./ui/badge";
import { Card, CardContent } from "./ui/card";
import type { Sweepstake } from "../types";

const revealSteps = [
  { message: "Generating seed", startProgress: 0, endProgress: 32, startTime: 0, endTime: 2_250 },
  { message: "Creating groups", startProgress: 32, endProgress: 79, startTime: 2_250, endTime: 5_550 },
  { message: "Finalising standings", startProgress: 79, endProgress: 100, startTime: 5_550, endTime: 7_000 },
];
const revealDuration = revealSteps[revealSteps.length - 1].endTime;
const lockedMessages = ["Results are generated in", "Assignments are locked", "Waiting for the reveal"];

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
    <div className="inline-flex items-center gap-2 text-5xl font-black tracking-normal tabular-nums sm:text-7xl lg:text-8xl">
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

export function DrawReplay({ sweepstake, onRevealReady }: { sweepstake: Sweepstake; onRevealReady: () => void }) {
  const revealAt = useMemo(() => new Date(sweepstake.reveal_at).getTime(), [sweepstake.reveal_at]);
  const [now, setNow] = useState(Date.now());
  const [progress, setProgress] = useState(0);
  const [revealMessage, setRevealMessage] = useState(revealSteps[0].message);
  const [lockedMessageIndex, setLockedMessageIndex] = useState(0);

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
  const isPreparingReveal = millisecondsRemaining <= 0;
  const { days, tickerSeconds } = countdownParts(millisecondsRemaining);

  useEffect(() => {
    if (sweepstake.draw_status === "draft") {
      return;
    }
    if (!isPreparingReveal) {
      setProgress(0);
      setRevealMessage(revealSteps[0].message);
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
        onRevealReady();
      }
    }, 120);

    return () => window.clearInterval(interval);
  }, [isPreparingReveal, onRevealReady, sweepstake.draw_status]);

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
              <h1 className="mt-5 min-h-[1.2em] text-3xl font-black tracking-normal sm:text-5xl">
                <AnimatePresence mode="wait">
                  <motion.span
                    key={revealMessage}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.22, ease: "easeOut" }}
                    className="inline-block"
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
              <div className="mx-auto mt-8 max-w-xl">
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
              <h1 className="mt-5 min-h-[1.2em] text-3xl font-black tracking-normal sm:text-5xl">
                <AnimatePresence mode="wait">
                  <motion.span
                    key={lockedMessages[lockedMessageIndex]}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.22, ease: "easeOut" }}
                    className="inline-block"
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
              <div className="mt-8">
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
