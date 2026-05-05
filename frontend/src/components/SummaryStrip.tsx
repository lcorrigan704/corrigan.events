import { ReceiptText, WalletCards } from "lucide-react";
import { formatGBP } from "../lib/utils";
import type { Sweepstake } from "../types";
import { Badge } from "./ui/badge";
import { Card, CardContent } from "./ui/card";

export function SummaryStrip({ sweepstake }: { sweepstake: Sweepstake }) {
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
                <Badge>{formatGBP(sweepstake.buy_in_pence)} buy-in</Badge>
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
