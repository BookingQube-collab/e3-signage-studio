import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { E3Button, E3Modal } from "@/components/e3";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEFAULT_PUBLIC_CMS_URL, getPublicCmsUrl } from "@/lib/cms-settings";
import { pairingCodeDigits } from "@/lib/pairing-code";
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

  useEffect(() => {
    setPublicCmsUrl(getPublicCmsUrl());
  }, []);

  useEffect(() => {
    if (!open) setCode("");
  }, [open]);

  const repair = useMutation({
    mutationFn: (pairingCode: string) => screenService.repair(screenId, pairingCode),
    onSuccess: (screen) => {
      void qc.invalidateQueries({ queryKey: ["screen", screenId] });
      void qc.invalidateQueries({ queryKey: ["screens"] });
      void qc.invalidateQueries({ queryKey: ["locations"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success(`${screen.name} is waiting for the player to connect`);
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Could not repair screen");
    },
  });

  const codeDigits = pairingCodeDigits(code).slice(0, 6);
  const codeValid = codeDigits.length === 6;

  return (
    <E3Modal
      open={open}
      onOpenChange={(next) => {
        if (!next && repair.isPending) return;
        onOpenChange(next);
      }}
      title={`Repair ${screenName}?`}
      description="This disconnects the current player. The screen, playlist, and campaigns stay the same. Enter the new 6-digit code shown on the replacement or reset TV."
      footer={
        <>
          <E3Button variant="outline" disabled={repair.isPending} onClick={() => onOpenChange(false)}>
            Cancel
          </E3Button>
          <E3Button
            variant="primary"
            loading={repair.isPending}
            disabled={!codeValid}
            onClick={() => repair.mutate(codeDigits)}
          >
            Disconnect and repair
          </E3Button>
        </>
      }
    >
      <div className="space-y-5">
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
            Open the E3 player pairing screen (pointed at {publicCmsUrl}) and enter the 6-digit
            code it shows. Do not use Add / Pair Screen — that would create a duplicate.
          </p>
        </div>
      </div>
    </E3Modal>
  );
}
