import type { LocationStatus, LocationType } from "@e3/shared-types";

import { getServiceRoleClient, isServiceRoleConfigured } from "./supabase.server";

type SeedLocation = {
  name: string;
  shortName: string;
  code: string;
  type: LocationType;
  status: LocationStatus;
  city: string;
};

/** Initial E3 venues — database rows only, never UI constants. */
export const INITIAL_LOCATIONS: readonly SeedLocation[] = [
  {
    name: "KDS",
    shortName: "KDS",
    code: "KDS",
    type: "PERMANENT_FEC",
    status: "ACTIVE",
    city: "Doha",
  },
  {
    name: "InflataPark",
    shortName: "InflataPark",
    code: "INFLATAPARK",
    type: "PERMANENT_FEC",
    status: "ACTIVE",
    city: "Doha",
  },
  {
    name: "Urban Arena",
    shortName: "Urban Arena",
    code: "URBAN-ARENA",
    type: "PERMANENT_FEC",
    status: "ACTIVE",
    city: "Lusail",
  },
  {
    name: "Crayons & Bricks Vendome Mall",
    shortName: "C&B Vendome",
    code: "CB-VENDOME",
    type: "PERMANENT_FEC",
    status: "ACTIVE",
    city: "Lusail",
  },
  {
    name: "Crayons & Bricks Dar Al Salam Mall",
    shortName: "C&B Dar Al Salam",
    code: "CB-DAR-AL-SALAM",
    type: "PERMANENT_FEC",
    status: "ACTIVE",
    city: "Doha",
  },
  {
    name: "Carousel Aspire Park",
    shortName: "Carousel Aspire",
    code: "CAROUSEL-ASPIRE",
    type: "OUTDOOR_EVENT",
    status: "ACTIVE",
    city: "Doha",
  },
  {
    name: "Event Qatar Show",
    shortName: "Event Qatar Show",
    code: "EVENT-QATAR-SHOW",
    type: "EXHIBITION",
    status: "UPCOMING",
    city: "DECC",
  },
];

/** Inserts the 7 seed locations when the org has none. Does not seed screens. */
export async function ensureSeedLocations(organizationId: string): Promise<boolean> {
  if (!isServiceRoleConfigured()) return false;
  const admin = getServiceRoleClient();
  const { count, error: countError } = await admin
    .from("locations")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId);
  if (countError) throw new Error(countError.message);
  if ((count ?? 0) > 0) return false;

  const { error } = await admin.from("locations").insert(
    INITIAL_LOCATIONS.map((loc) => ({
      organization_id: organizationId,
      name: loc.name,
      short_name: loc.shortName,
      code: loc.code,
      type: loc.type,
      status: loc.status,
      city: loc.city,
      timezone: "Asia/Qatar",
    })),
  );
  if (error) {
    // Unique race if two requests seed at once — treat as already seeded.
    if (error.code === "23505") return false;
    throw new Error(error.message);
  }
  return true;
}
