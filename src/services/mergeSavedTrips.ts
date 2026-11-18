import type { SavedTrip } from '../types/tripStore';

/**
 * Merge cloud + local saved trips for a single Saved-tab list.
 * - Dedupes by stable trip `id`
 * - Same id → prefer the cloud version (callers should pass cloud as `cloud`)
 * - Sort newest-first by `createdAt` (same convention as localListSavedTrips)
 * - Does not push local-only rows to the cloud
 */
export function mergeCloudAndLocalSavedTrips(
  cloud: SavedTrip[],
  local: SavedTrip[],
): SavedTrip[] {
  const byId = new Map<string, SavedTrip>();

  for (const trip of local) {
    byId.set(trip.id, trip);
  }
  for (const trip of cloud) {
    byId.set(trip.id, trip);
  }

  return [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
