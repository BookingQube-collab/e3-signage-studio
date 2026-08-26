import { createHash, randomBytes, randomInt } from "node:crypto";

export function hashPairingCode(code: string): string {
  return createHash("sha256").update(code.replace(/\D/g, ""), "utf8").digest("hex");
}

export function hashDeviceToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function generatePairingCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function generateDeviceToken(): string {
  return randomBytes(32).toString("base64url");
}
