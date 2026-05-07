import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { useCallback } from "react";
import { getByCode, requestAdminLinks } from "./lib/api";
import type { CreatedSweepstake, Sweepstake } from "./types";
import { AdminView } from "./components/AdminView";
import { AssignmentTable } from "./components/AssignmentTable";
import { CodeEntry } from "./components/CodeEntry";
import { CreateSweepstake } from "./components/CreateSweepstake";
import { DrawReplay } from "./components/DrawReplay";
import { KnockoutBracket } from "./components/KnockoutBracket";
import { PortalView } from "./components/PortalView";
import { SummaryStrip } from "./components/SummaryStrip";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Card, CardContent } from "./components/ui/card";
import { Input } from "./components/ui/input";

const REVEAL_PREP_DURATION_MS = 7_000;
const REVEAL_REPLAY_GRACE_MS = 5 * 60_000;

function codeFromPath() {
  const match = window.location.pathname.match(/\/s\/([0-9]{6})/);
  return match?.[1] ?? "";
}

function adminTokenFromPath() {
  const match = window.location.pathname.match(/\/admin\/([^/]+)$/);
  return match?.[1] ?? "";
}

function portalTokenFromPath() {
  const match = window.location.pathname.match(/\/portal\/([^/]+)$/);
  return match?.[1] ?? "";
}

function isPortalPath() {
  return window.location.pathname === "/portal" || Boolean(portalTokenFromPath());
}

function shouldSkipRevealReplay(sweepstake: Sweepstake) {
  return sweepstake.is_revealed && Date.now() - new Date(sweepstake.reveal_at).getTime() > REVEAL_REPLAY_GRACE_MS;
}

function useSystemTheme() {
  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      const theme = query.matches ? "dark" : "light";
      document.documentElement.dataset.systemTheme = theme;
      document.documentElement.classList.toggle("dark", theme === "dark");
    };

    applyTheme();
    query.addEventListener("change", applyTheme);
    return () => query.removeEventListener("change", applyTheme);
  }, []);
}

export default function App() {
  useSystemTheme();
  const [created, setCreated] = useState<CreatedSweepstake | undefined>();
  const [participant, setParticipant] = useState<Sweepstake | null>(null);
  const [participantCode, setParticipantCode] = useState(codeFromPath());
  const [participantLoading, setParticipantLoading] = useState(Boolean(codeFromPath()));
  const [completedRevealCodes, setCompletedRevealCodes] = useState<Set<string>>(() => new Set());
  const [replayRequestedCodes, setReplayRequestedCodes] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(window.location.pathname === "/create");
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotMessage, setForgotMessage] = useState<string | null>(null);
  const [forgotLinks, setForgotLinks] = useState<{ title: string; admin_url: string; view_code: string }[]>([]);
  const isPortal = isPortalPath();
  const isAdmin = Boolean(adminTokenFromPath());

  useEffect(() => {
    if (window.location.pathname === "/admin" || window.location.pathname === "/admin/") {
      window.history.replaceState({}, "", "/");
      setShowCreate(false);
    }
  }, []);

  useEffect(() => {
    const code = codeFromPath();
    if (code) {
      setParticipantCode(code.toUpperCase());
      getByCode(code)
        .then((nextParticipant) => {
          setParticipant(nextParticipant);
          if (shouldSkipRevealReplay(nextParticipant)) {
            setCompletedRevealCodes((codes) => new Set(codes).add(nextParticipant.view_code));
          }
        })
        .catch((caught) => setError(caught instanceof Error ? caught.message : "Could not load sweepstake"))
        .finally(() => setParticipantLoading(false));
    }
  }, []);

  const refreshParticipant = useCallback(() => {
    if (!participantCode) return;

    getByCode(participantCode)
      .then((nextParticipant) => {
        setParticipant(nextParticipant);
        if (shouldSkipRevealReplay(nextParticipant)) {
          setCompletedRevealCodes((codes) => new Set(codes).add(nextParticipant.view_code));
        }
      })
      .catch(() => {
        // Keep the locked view mounted if a background refresh is throttled or briefly fails.
      });
  }, [participantCode]);

  const loadRevealedParticipant = useCallback(async () => {
    if (!participantCode) return null;
    try {
      const nextParticipant = await getByCode(participantCode);
      setParticipant(nextParticipant);
      return nextParticipant;
    } catch {
      return null;
    }
  }, [participantCode]);

  const completeReveal = useCallback(() => {
    if (!participantCode) return;
    const normalizedCode = participantCode.toUpperCase();
    setCompletedRevealCodes((codes) => new Set(codes).add(normalizedCode));
    setReplayRequestedCodes((codes) => {
      const next = new Set(codes);
      next.delete(normalizedCode);
      return next;
    });
    refreshParticipant();
  }, [participantCode, refreshParticipant]);

  const replayDraw = useCallback(() => {
    if (!participantCode) return;
    const normalizedCode = participantCode.toUpperCase();
    setReplayRequestedCodes((codes) => new Set(codes).add(normalizedCode));
    setCompletedRevealCodes((codes) => {
      const next = new Set(codes);
      next.delete(normalizedCode);
      return next;
    });
  }, [participantCode]);

  async function openCode(code: string) {
    setError(null);
    setParticipantLoading(true);
    try {
      const nextParticipant = await getByCode(code);
      setParticipant(nextParticipant);
      setParticipantCode(code.toUpperCase());
      if (shouldSkipRevealReplay(nextParticipant)) {
        setCompletedRevealCodes((codes) => new Set(codes).add(nextParticipant.view_code));
      } else {
        setCompletedRevealCodes((codes) => {
          const next = new Set(codes);
          next.delete(code.toUpperCase());
          return next;
        });
      }
      window.history.replaceState({}, "", `/s/${code.toUpperCase()}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load sweepstake");
    } finally {
      setParticipantLoading(false);
    }
  }

  async function recoverAdminLink(event: FormEvent) {
    event.preventDefault();
    setForgotLoading(true);
    setForgotMessage(null);
    setForgotLinks([]);
    try {
      const recovery = await requestAdminLinks(forgotEmail);
      setForgotMessage(recovery.message);
      setForgotLinks(recovery.dev_links);
    } catch (caught) {
      setForgotMessage(caught instanceof Error ? caught.message : "Could not request admin link");
    } finally {
      setForgotLoading(false);
    }
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-7xl min-w-0 flex-col gap-6 px-4 py-6 md:px-8">
        {isPortal ? (
          <PortalView />
        ) : isAdmin ? (
          <AdminView created={created} />
        ) : participantLoading ? (
          <div className="flex min-h-[calc(100vh-140px)] items-center justify-center">
            <Card className="w-full max-w-md">
              <CardContent className="p-8 text-center">
                <Badge>sweepstakes.corrigan.events</Badge>
                <h1 className="mt-4 text-2xl font-black tracking-normal">Loading draw</h1>
                <p className="mt-2 text-sm text-muted-foreground">Checking the participant view code.</p>
              </CardContent>
            </Card>
          </div>
        ) : participant ? (
          <div className="min-w-0 space-y-5">
            {participant.is_revealed && completedRevealCodes.has(participant.view_code) ? (
              <>
                <SummaryStrip sweepstake={participant} onReplayDraw={replayDraw} />
                <div className="grid w-full min-w-0 max-w-full items-start gap-5 xl:grid-cols-[minmax(390px,1.15fr)_minmax(0,2.85fr)]">
                  <div className="w-full min-w-0 max-w-full">
                    <AssignmentTable sweepstake={participant} />
                  </div>
                  <div className="w-full min-w-0 max-w-full space-y-5">
                    <KnockoutBracket sweepstake={participant} />
                  </div>
                </div>
              </>
            ) : (
              <DrawReplay
                sweepstake={participant}
                onRevealReady={completeReveal}
                onRevealUnlocked={loadRevealedParticipant}
                startInReplay={replayRequestedCodes.has(participant.view_code)}
              />
            )}
          </div>
        ) : showCreate ? (
          <div className="mx-auto w-full max-w-4xl">
            <CreateSweepstake
              onCreated={(next) => {
                setCreated(next);
                const adminParts = next.admin_url.split("/");
                window.history.replaceState({}, "", `/admin/${adminParts[adminParts.length - 1]}`);
              }}
            />
          </div>
        ) : (
          <div className="flex min-h-[calc(100vh-140px)] items-center justify-center">
            <Card className="w-full max-w-md">
              <CardContent className="space-y-6 p-8 text-center">
                <div>
                  <Badge>sweepstakes.corrigan.events</Badge>
                  <h1 className="mt-4 text-3xl font-black tracking-normal">Enter your view code</h1>
                  <p className="mt-2 text-sm text-muted-foreground">Use the 6-character code shared by the organiser.</p>
                </div>
                <CodeEntry onSubmit={openCode} />
                {error && <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
                <div className="flex flex-wrap items-center justify-center gap-4">
                  <button
                    type="button"
                    className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                    onClick={() => {
                      setShowCreate(true);
                      window.history.replaceState({}, "", "/create");
                    }}
                  >
                    Create a draw?
                  </button>
                  <button
                    type="button"
                    className="text-sm font-medium text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
                    onClick={() => setForgotOpen((open) => !open)}
                  >
                    Forgot admin link?
                  </button>
                </div>
                {forgotOpen && (
                  <form onSubmit={recoverAdminLink} className="space-y-3 rounded-md border bg-card p-3 text-left">
                    <div className="space-y-2">
                      <label htmlFor="forgot-email" className="text-sm font-medium">
                        Organiser email
                      </label>
                      <Input
                        id="forgot-email"
                        type="email"
                        required
                        value={forgotEmail}
                        placeholder="you@example.com"
                        onChange={(event) => setForgotEmail(event.target.value)}
                      />
                    </div>
                    <Button type="submit" className="w-full" disabled={forgotLoading}>
                      {forgotLoading ? "Sending..." : "Send admin link"}
                    </Button>
                    {forgotMessage && <p className="text-center text-xs text-muted-foreground">{forgotMessage}</p>}
                    {forgotLinks.length > 0 && (
                      <div className="space-y-2 rounded-md border bg-muted p-2">
                        <p className="text-xs font-medium text-muted-foreground">Dev links</p>
                        {forgotLinks.map((link) => (
                          <a
                            key={link.admin_url}
                            href={link.admin_url}
                            className="block rounded-md bg-background p-2 text-xs text-primary hover:underline"
                          >
                            {link.title} - code {link.view_code}
                          </a>
                        ))}
                      </div>
                    )}
                  </form>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </main>
  );
}
