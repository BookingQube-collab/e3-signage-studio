import type { CampaignTargetType } from "@e3/shared-types";

export type ScreenLite = {
  id: string;
  locationId: string;
  organizationId: string;
  operationalStatus: string;
  archivedAt: string | null;
};

export type GroupLite = {
  id: string;
  screenIds: string[];
};

export type TargetLite = {
  type: CampaignTargetType;
  targetId: string | null;
};

export function isScreenEligible(screen: ScreenLite): boolean {
  return (
    Boolean(screen.locationId) &&
    !screen.archivedAt &&
    screen.operationalStatus !== "DISABLED"
  );
}

export function resolveTargetScreenIds(
  targets: TargetLite[],
  screens: ScreenLite[],
  groups: GroupLite[],
): string[] {
  const byId = new Map(screens.map((screen) => [screen.id, screen]));
  const byLocation = new Map<string, string[]>();
  for (const screen of screens) {
    const loc = byLocation.get(screen.locationId) ?? [];
    loc.push(screen.id);
    byLocation.set(screen.locationId, loc);
  }
  const groupMap = new Map(groups.map((group) => [group.id, group.screenIds]));
  const ids = new Set<string>();

  for (const target of targets) {
    if (target.type === "SCREEN" && target.targetId) {
      ids.add(target.targetId);
    } else if (target.type === "LOCATION" && target.targetId) {
      for (const id of byLocation.get(target.targetId) ?? []) ids.add(id);
    } else if (target.type === "SCREEN_GROUP" && target.targetId) {
      for (const id of groupMap.get(target.targetId) ?? []) ids.add(id);
    } else if (target.type === "ORGANIZATION") {
      const orgId = target.targetId;
      for (const screen of screens) {
        if (!orgId || screen.organizationId === orgId) ids.add(screen.id);
      }
    }
  }

  return [...ids].filter((id) => {
    const screen = byId.get(id);
    return screen ? isScreenEligible(screen) : false;
  });
}

export function campaignIdsTargetingScreen(
  screen: ScreenLite,
  campaignTargets: Array<{ campaignId: string; type: CampaignTargetType; targetId: string | null }>,
  groups: GroupLite[],
): string[] {
  const memberGroups = new Set(
    groups.filter((group) => group.screenIds.includes(screen.id)).map((group) => group.id),
  );
  const ids = new Set<string>();
  for (const target of campaignTargets) {
    if (target.type === "SCREEN" && target.targetId === screen.id) ids.add(target.campaignId);
    if (target.type === "LOCATION" && target.targetId === screen.locationId) ids.add(target.campaignId);
    if (target.type === "SCREEN_GROUP" && target.targetId && memberGroups.has(target.targetId)) {
      ids.add(target.campaignId);
    }
    if (target.type === "ORGANIZATION") ids.add(target.campaignId);
  }
  return [...ids];
}
