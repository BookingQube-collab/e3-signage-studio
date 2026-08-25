/**
 * Canonical priority: higher number wins.
 *
 *   Emergency override     100
 *   Special event           80
 *   Campaign                50
 *   Normal playlist         10
 *
 * Tie-break, in order:
 *   1. emergency flag on the campaign
 *   2. later schedule start (more specific window)
 *   3. later campaign.created_at
 *   4. campaign id (stable)
 *
 * Disabled screens never receive a new manifest.
 * Expired schedules drop out on the device using the local clock — no cloud call.
 *
 * The Lovable campaign wizard currently treats 1 as “highest”. Convert at the
 * API boundary; do not change the wizard copy in this phase.
 */

export const PRIORITY_EMERGENCY = 100;
export const PRIORITY_SPECIAL_EVENT = 80;
export const PRIORITY_CAMPAIGN = 50;
export const PRIORITY_NORMAL = 10;

/** UI 1 (highest) … 10 (lowest) → canonical 100 … 10 */
export function uiPriorityToCanonical(uiPriority: number): number {
  const clamped = Math.min(10, Math.max(1, Math.round(uiPriority)));
  return (11 - clamped) * 10;
}

export function canonicalPriorityToUi(canonical: number): number {
  const clamped = Math.min(100, Math.max(10, canonical));
  return Math.max(1, 11 - Math.round(clamped / 10));
}

export type ScheduleCandidate = {
  campaignId: string;
  emergency: boolean;
  priority: number;
  startAt: Date;
  createdAt: Date;
};

export function pickWinningSchedule(candidates: ScheduleCandidate[]): ScheduleCandidate | null {
  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) => {
    if (a.emergency !== b.emergency) return a.emergency ? -1 : 1;
    if (a.priority !== b.priority) return b.priority - a.priority;
    if (a.startAt.getTime() !== b.startAt.getTime())
      return b.startAt.getTime() - a.startAt.getTime();
    if (a.createdAt.getTime() !== b.createdAt.getTime()) {
      return b.createdAt.getTime() - a.createdAt.getTime();
    }
    return a.campaignId < b.campaignId ? -1 : 1;
  })[0]!;
}
