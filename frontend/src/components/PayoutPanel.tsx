import { Badge } from "./ui/badge";
import { Card, CardContent, CardHeader } from "./ui/card";
import { formatGBP } from "../lib/utils";
import type { Sweepstake } from "../types";

export function PayoutPanel({ sweepstake }: { sweepstake: Sweepstake }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Payout Terms</h2>
            <p className="text-sm text-muted-foreground">Displayed only. Payments are managed outside the app.</p>
          </div>
          <Badge>{formatGBP(sweepstake.buy_in_pence)} buy-in</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {sweepstake.payouts.map((payout) => (
          <div key={payout.label} className="flex items-center justify-between rounded-md border bg-muted px-3 py-3">
            <div>
              <div className="font-semibold">{payout.label}</div>
              <div className="text-xs text-muted-foreground">{payout.percentage}% of pot</div>
            </div>
            <div className="text-lg font-black text-primary">{formatGBP(payout.amount_pence)}</div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
