import { useEffect, useMemo, useState } from "react";
import { Check, Copy, ExternalLink, KeyRound, MoreHorizontal, RefreshCw, Trash2 } from "lucide-react";
import { deletePortalSweepstake, generatePortalAdminLink, getPortalSweepstakes } from "../lib/api";
import { formatGBP } from "../lib/utils";
import type { PortalSweepstake } from "../types";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/London",
  }).format(new Date(value));
}

function portalTokenFromPath() {
  const match = window.location.pathname.match(/\/portal\/([^/]+)$/);
  const token = match?.[1] ?? "";
  if (token) {
    window.sessionStorage.setItem("portalToken", token);
    window.history.replaceState({}, "", "/portal");
    return token;
  }
  return window.sessionStorage.getItem("portalToken") ?? "";
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <Button type="button" variant="ghost" size="sm" className="w-full justify-start" onClick={copy}>
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      {copied ? "Copied" : label}
    </Button>
  );
}

function PortalActionTrigger({ title }: { title: string }) {
  return (
    <PopoverTrigger asChild>
      <Button type="button" variant="outline" size="icon-sm" aria-label={`Actions for ${title}`}>
        <MoreHorizontal className="h-4 w-4" />
      </Button>
    </PopoverTrigger>
  );
}

function PortalActions({
  sweepstake,
  adminUrl,
  generating,
  deleting,
  onGenerateAdminLink,
  onDelete,
}: {
  sweepstake: PortalSweepstake;
  adminUrl: string | null | undefined;
  generating: boolean;
  deleting: boolean;
  onGenerateAdminLink: () => void;
  onDelete: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
      <Popover>
        <PortalActionTrigger title={sweepstake.title} />
        <PopoverContent align="end" className="w-60 p-2">
          <div className="space-y-1">
            <CopyButton value={sweepstake.participant_url} label="Copy join link" />
            <Button type="button" variant="ghost" size="sm" className="w-full justify-start" asChild>
              <a href={sweepstake.participant_url} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4" />
                Open join view
              </a>
            </Button>
            {adminUrl ? (
              <>
                <CopyButton value={adminUrl} label="Copy admin link" />
                <Button type="button" variant="ghost" size="sm" className="w-full justify-start" asChild>
                  <a href={adminUrl} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-4 w-4" />
                    Open admin view
                  </a>
                </Button>
              </>
            ) : (
              <Button type="button" variant="ghost" size="sm" className="w-full justify-start" disabled={generating} onClick={onGenerateAdminLink}>
                <KeyRound className="h-4 w-4" />
                {generating ? "Generating..." : "Generate admin link"}
              </Button>
            )}
            <Button type="button" variant="destructive" size="sm" className="w-full justify-start" onClick={() => setConfirmOpen(true)}>
              <Trash2 className="h-4 w-4" />
              Delete sweepstake
            </Button>
          </div>
        </PopoverContent>
      </Popover>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete this sweepstake?</DialogTitle>
          <DialogDescription>
            This permanently deletes "{sweepstake.title}", including participants, assignments, payouts, fixtures, and admin links.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={deleting}>
              Cancel
            </Button>
          </DialogClose>
          <Button type="button" variant="destructive" disabled={deleting} onClick={onDelete}>
            <Trash2 className="h-4 w-4" />
            {deleting ? "Deleting..." : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PortalMobileCard({
  sweepstake,
  adminUrl,
  generating,
  deleting,
  onGenerateAdminLink,
  onDelete,
}: {
  sweepstake: PortalSweepstake;
  adminUrl: string | null | undefined;
  generating: boolean;
  deleting: boolean;
  onGenerateAdminLink: () => void;
  onDelete: () => void;
}) {
  return (
    <Card size="sm">
      <CardHeader className="grid-cols-[1fr_auto] gap-3">
        <div className="min-w-0">
          <CardTitle className="truncate">{sweepstake.title}</CardTitle>
          <CardDescription className="truncate">{sweepstake.organiser_email ?? "No organiser email"}</CardDescription>
        </div>
        <PortalActions
          sweepstake={sweepstake}
          adminUrl={adminUrl}
          generating={generating}
          deleting={deleting}
          onGenerateAdminLink={onGenerateAdminLink}
          onDelete={onDelete}
        />
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">{sweepstake.view_code}</Badge>
          <Badge>{sweepstake.draw_status}</Badge>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-muted-foreground">Slots</div>
            <div className="font-medium">
              {sweepstake.named_slot_count}/{sweepstake.slot_count}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground">Pot</div>
            <div className="font-medium">{formatGBP(sweepstake.pot_pence)}</div>
          </div>
          <div className="col-span-2">
            <div className="text-muted-foreground">Reveal</div>
            <div className="font-medium">{formatDate(sweepstake.reveal_at)}</div>
          </div>
          <div className="col-span-2">
            <div className="text-muted-foreground">Created</div>
            <div className="font-medium">{formatDate(sweepstake.created_at)}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function PortalView() {
  const token = useMemo(() => portalTokenFromPath(), []);
  const [sweepstakes, setSweepstakes] = useState<PortalSweepstake[]>([]);
  const [adminLinks, setAdminLinks] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generatingId, setGeneratingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  async function load() {
    setError(null);
    setLoading(true);
    try {
      setSweepstakes(await getPortalSweepstakes(token));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load portal");
    } finally {
      setLoading(false);
    }
  }

  async function generateAdminLink(sweepstakeId: number) {
    setGeneratingId(sweepstakeId);
    setError(null);
    try {
      const response = await generatePortalAdminLink(token, sweepstakeId);
      setAdminLinks((links) => ({ ...links, [sweepstakeId]: response.admin_url }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not generate admin link");
    } finally {
      setGeneratingId(null);
    }
  }

  async function deleteSweepstake(sweepstakeId: number) {
    setDeletingId(sweepstakeId);
    setError(null);
    try {
      await deletePortalSweepstake(token, sweepstakeId);
      setSweepstakes((items) => items.filter((item) => item.id !== sweepstakeId));
      setAdminLinks((links) => {
        const next = { ...links };
        delete next[sweepstakeId];
        return next;
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete sweepstake");
    } finally {
      setDeletingId(null);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5">
      <Card>
        <CardHeader className="gap-3 sm:grid-cols-[1fr_auto]">
          <div>
            <Badge>Owner portal</Badge>
            <CardTitle className="mt-4 text-3xl font-black tracking-normal">Sweepstakes admin links</CardTitle>
            <CardDescription>Private lookup for generated draws, participant codes, and replacement organiser links.</CardDescription>
          </div>
          <Button type="button" variant="secondary" onClick={load} disabled={loading}>
            <RefreshCw className="h-4 w-4" />
            {loading ? "Loading..." : "Refresh"}
          </Button>
        </CardHeader>
        {error && (
          <CardContent>
            <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
          </CardContent>
        )}
      </Card>

      <div className="space-y-3 md:hidden">
        {loading ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">Loading sweepstakes...</CardContent>
          </Card>
        ) : sweepstakes.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">No sweepstakes found.</CardContent>
          </Card>
        ) : (
          sweepstakes.map((sweepstake) => {
            const adminUrl = adminLinks[sweepstake.id] ?? sweepstake.admin_url;
            return (
              <PortalMobileCard
                key={sweepstake.id}
                sweepstake={sweepstake}
                adminUrl={adminUrl}
                generating={generatingId === sweepstake.id}
                deleting={deletingId === sweepstake.id}
                onGenerateAdminLink={() => generateAdminLink(sweepstake.id)}
                onDelete={() => deleteSweepstake(sweepstake.id)}
              />
            );
          })
        )}
      </div>

      <Card className="hidden md:flex">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Draw</TableHead>
                <TableHead>Organiser</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Slots</TableHead>
                <TableHead>Pot</TableHead>
                <TableHead>Reveal</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                    Loading sweepstakes...
                  </TableCell>
                </TableRow>
              ) : sweepstakes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                    No sweepstakes found.
                  </TableCell>
                </TableRow>
              ) : (
                sweepstakes.map((sweepstake) => {
                  const adminUrl = adminLinks[sweepstake.id] ?? sweepstake.admin_url;
                  return (
                    <TableRow key={sweepstake.id}>
                      <TableCell>
                        <div className="font-medium">{sweepstake.title}</div>
                        <div className="text-xs text-muted-foreground">Created {formatDate(sweepstake.created_at)}</div>
                      </TableCell>
                      <TableCell>{sweepstake.organiser_email ?? "No email"}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{sweepstake.view_code}</Badge>
                      </TableCell>
                      <TableCell>{sweepstake.draw_status}</TableCell>
                      <TableCell>
                        {sweepstake.named_slot_count}/{sweepstake.slot_count}
                      </TableCell>
                      <TableCell>{formatGBP(sweepstake.pot_pence)}</TableCell>
                      <TableCell>{formatDate(sweepstake.reveal_at)}</TableCell>
                      <TableCell className="text-right">
                        <PortalActions
                          sweepstake={sweepstake}
                          adminUrl={adminUrl}
                          generating={generatingId === sweepstake.id}
                          deleting={deletingId === sweepstake.id}
                          onGenerateAdminLink={() => generateAdminLink(sweepstake.id)}
                          onDelete={() => deleteSweepstake(sweepstake.id)}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
