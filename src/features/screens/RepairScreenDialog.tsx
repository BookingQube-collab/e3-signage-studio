import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { E3Button, E3Modal } from "@/components/e3";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEFAULT_PUBLIC_CMS_URL, getPublicCmsUrl } from "@/lib/cms-settings";
import { pairingCodeDigits } from "@/lib/pairing-code";
import { invalidateKeysInBackground, writeEntityCache } from "@/lib/query-cache";
import { screenService } from "@/services";

export function RepairScreenDialog({
  open,
  onOpenChange,
  screenId,
  screenName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  screenId: string;
  screenName: string;
}) {
  const qc = useQueryClient();
  const [code, setCode] = useState("");
  const [publicCmsUrl, setPublicCmsUrl] = useState(DEFAULT_PUBLIC_CMS_URL);
  const [disconnected, setDisconnected] = useState(false);

  useEffect(() => {
    setPublicCmsUrl(getPublicCmsUrl());
  }, []);

  useEffect(() => {
    if (!open) {
      setCode("");
      setDisconnected(false);
    }
  }, [open]);

  const beginRepair = useMutation({
    mutationFn: () => screenService.beginRepair(screenId),
    onSuccess: (screen) => {
      writeEntityCache(qc, {
        detailKey: ["screen", screenId],
        listKey: ["screens"],
        entity: screen,
      });
      setDisconnected(true);
      toast.success(
        "Player disconnected. Within ~15 seconds the TV should show a new 6-digit code.",
      );
      invalidateKeysInBackground(qc, [["locations"], ["dashboard"]]);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Could not disconnect the player");
    },
  });

  const repair = useMutation({
    mutationFn: (pairingCode: string) => screenService.repair(screenId, pairingCode),
    onSuccess: (screen) => {
      writeEntityCache(qc, {
        detailKey: ["screen", screenId],
        listKey: ["screens"],
        entity: screen,
      });
      toast.success(`${screen.name} is waiting for the player to connect`);
      onOpenChange(false);
      invalidateKeysInBackground(qc, [["locations"], ["dashboard"]]);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Could not repair screen");
    },
  });

  const codeDigits = pairingCodeDigits(code).slice(0, 6);
  const codeValid = codeDigits.length === 6;
  const busy = beginRepair.isPending || repair.isPending;

  return (
    <E3Modal
      open={open}
      onOpenChange={(next) => {
        if (!next && busy) return;
        onOpenChange(next);
      }}
      title={`Repair ${screenName}?`}
      description="This keeps the screen, playlist, and campaigns. First disconnect the old player so the TV shows a new pairing code, then enter that code here."
      footer={
        <>
          <E3Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </E3Button>
          {!disconnected ? (
            <E3Button
              variant="primary"
              loading={beginRepair.isPending}
              onClick={() => beginRepair.mutate()}
            >
              Disconnect player
            </E3Button>
          ) : (
            <E3Button
              variant="primary"
              loading={repair.isPending}
              disabled={!codeValid}
              onClick={() => repair.mutate(codeDigits)}
            >
              Link new code
            </E3Button>
          )}
        </>
      }
    >
      <div className="space-y-5">
        {!disconnected ? (
          <p className="text-sm text-muted-foreground">
            Click <strong>Disconnect player</strong>. The TV leaves playback and requests a fresh
            6-digit code (player 0.28+). If nothing changes within 20 seconds, long-press OK/Select
            on the TV for about a second to force the pairing screen.
          </p>
        ) : (
          <>
            <div className="e3-gradient-border rounded-2xl bg-background p-6 text-center">
              <p className="text-xs uppercase tracking-widest text-muted-foreground">Pairing code</p>
              <p className="font-display mt-2 text-4xl font-bold tabular-nums tracking-[0.3em]">
                {(codeDigits.padEnd(6, "•").match(/.{1,3}/g) ?? []).join(" ")}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="repair-code">Code from the TV</Label>
              <Input
                id="repair-code"
                inputMode="numeric"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="583 294"
                disabled={repair.isPending}
                className="h-12 text-center text-lg tracking-[0.3em]"
              />
              <p className="text-xs text-muted-foreground">
                Enter the code shown on the TV (CMS {publicCmsUrl}). Do not use Add / Pair Screen —
                that would create a duplicate.
              </p>
            </div>
          </>
        )}
      </div>
    </E3Modal>
  );
}
