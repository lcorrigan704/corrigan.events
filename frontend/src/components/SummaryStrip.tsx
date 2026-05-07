import { useMemo, useState } from "react";
import { Check, Copy, MoreHorizontal, ReceiptText, RotateCcw, ShieldCheck, WalletCards } from "lucide-react";
import { formatGBP } from "../lib/utils";
import type { Sweepstake } from "../types";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

function DrawActionsMenu({ sweepstake, onReplayDraw }: { sweepstake: Sweepstake; onReplayDraw?: () => void }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const auditJson = useMemo(() => JSON.stringify(sweepstake.audit_metadata ?? {}, null, 2), [sweepstake.audit_metadata]);

  if (!sweepstake.audit_metadata && !onReplayDraw) {
    return null;
  }

  async function copyAuditJson() {
    await navigator.clipboard.writeText(auditJson);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <Popover>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" size="icon-sm" aria-label="Draw actions">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-56 p-2">
          {onReplayDraw && (
            <Button type="button" variant="ghost" size="sm" className="w-full justify-start" onClick={onReplayDraw}>
              <RotateCcw className="h-4 w-4" />
              Replay draw
            </Button>
          )}
          {sweepstake.audit_metadata && (
            <Button type="button" variant="ghost" size="sm" className="w-full justify-start" onClick={() => setDialogOpen(true)}>
              <ShieldCheck className="h-4 w-4" />
              View audit metadata
            </Button>
          )}
        </PopoverContent>
      </Popover>
      {sweepstake.audit_metadata && (
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
      )}
    </Dialog>
  );
}

export function SummaryStrip({ sweepstake, onReplayDraw }: { sweepstake: Sweepstake; onReplayDraw?: () => void }) {
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
                  <DrawActionsMenu sweepstake={sweepstake} onReplayDraw={onReplayDraw} />
                </div>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {sweepstake.payouts.map((payout) => (
                  <div key={payout.label} className="flex items-center justify-between gap-3 rounded-md border bg-muted px-3 py-1.5">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{payout.label}</div>
                      <div className="text-xs text-muted-foreground">{payout.percentage}%</div>
                    </div>
                    <div className="shrink-0 text-sm font-black">{formatGBP(payout.amount_pence)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
