export function pairingCodeDigits(code: string): string {
  return code.replace(/\D/g, "");
}

export function assertPairingCodeDigits(code: string): string {
  const digits = pairingCodeDigits(code);
  if (digits.length !== 6) throw new Error("Pairing code must be 6 digits.");
  return digits;
}

export type PairingCodeLinkState = {
  expiresAt: string;
  consumedAt: string | null;
  screenId: string | null;
};

export function pairingCodeLinkError(
  row: PairingCodeLinkState,
  screenId: string,
  nowMs = Date.now(),
): string | null {
  if (row.consumedAt) return "This pairing code was already used.";
  if (new Date(row.expiresAt).getTime() < nowMs) {
    return "This pairing code has expired.";
  }
  if (row.screenId && row.screenId !== screenId) {
    return "This pairing code is already linked to another screen.";
  }
  return null;
}
