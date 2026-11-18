import type { SavedTrip, SaveTripResult, TripSnapshot } from '../types/tripStore';
import {
  apiListSavedTrips,
  apiRemoveSavedTrip,
  apiSaveTrip,
  isApiConfigured,
  apiHealth,
} from './api/tripApiClient';
import {
  localGetSavedTrip,
  localListSavedTrips,
  localRemoveSavedTrip,
  localSaveTrip,
} from './localSavedTripsStore';
import { mergeCloudAndLocalSavedTrips } from './mergeSavedTrips';
import { normalizeTripSnapshot } from './normalizeRecommendationSnapshot';
import { SAVE_FAIL } from './saveTripMessages';

export {
  SAVE_FAIL,
  SAVE_SUCCESS_CLOUD,
  SAVE_SUCCESS_LOCAL,
  SAVE_SUCCESS_LOCAL_AFTER_CLOUD_FAIL,
  saveSuccessMessage,
} from './saveTripMessages';

export { mergeCloudAndLocalSavedTrips } from './mergeSavedTrips';

function withNormalizedSnapshot(trip: SavedTrip): SavedTrip {
  return { ...trip, snapshot: normalizeTripSnapshot(trip.snapshot) };
}

async function isSupabaseBackendAvailable(): Promise<boolean> {
  if (!isApiConfigured()) {
    return false;
  }
  const health = await apiHealth();
  return Boolean(health?.ok && health.supabaseConfigured);
}

/**
 * Adapter: Supabase-backed API when configured, otherwise stage-4 client Storage fallback.
 *
 * When cloud listing succeeds, local-only rows (e.g. after `local_after_cloud_fail`) are
 * merged in. Same id → cloud wins. Local rows are never silently pushed to the cloud.
 */
export async function listSavedTrips(): Promise<SavedTrip[]> {
  if (await isSupabaseBackendAvailable()) {
    try {
      const cloud = (await apiListSavedTrips()).map(withNormalizedSnapshot);
      let local: SavedTrip[] = [];
      try {
        local = await localListSavedTrips();
      } catch (localError) {
        console.warn('saved trips local list failed during cloud merge; returning cloud only', localError);
      }
      return mergeCloudAndLocalSavedTrips(cloud, local);
    } catch (error) {
      console.warn('saved trips API failed; falling back to local store', error);
    }
  }
  return localListSavedTrips();
}

export async function getSavedTrip(id: string): Promise<SavedTrip | null> {
  if (await isSupabaseBackendAvailable()) {
    try {
      const trips = await apiListSavedTrips();
      const hit = trips.find((trip) => trip.id === id) ?? null;
      if (hit) {
        return withNormalizedSnapshot(hit);
      }
      // Cloud miss: still surface a local-only row (same merge rule as list).
      return localGetSavedTrip(id);
    } catch (error) {
      console.warn('saved trip get API failed; falling back to local store', error);
    }
  }
  return localGetSavedTrip(id);
}

export async function saveTrip(snapshot: TripSnapshot): Promise<SaveTripResult> {
  if (await isSupabaseBackendAvailable()) {
    try {
      const trip = await apiSaveTrip(snapshot);
      return { trip, persistence: 'cloud' };
    } catch (error) {
      console.warn('saved trip save API failed; falling back to local store', error);
      try {
        const trip = await localSaveTrip(snapshot);
        return { trip, persistence: 'local_after_cloud_fail' };
      } catch (localError) {
        console.warn('saved trip local fallback also failed', localError);
        throw localError instanceof Error ? localError : new Error(SAVE_FAIL);
      }
    }
  }
  const trip = await localSaveTrip(snapshot);
  return { trip, persistence: 'local' };
}

/**
 * Delete from both stores when possible so a successful cloud list + local merge
 * cannot resurrect the row. Cloud delete is best-effort when the API is available;
 * local delete always runs afterward.
 *
 * Limitation (no tombstone metadata): if the user deletes while cloud is unavailable
 * and a copy still exists only in Supabase, that cloud row can reappear on the next
 * successful cloud list.
 */
export async function removeSavedTrip(id: string): Promise<void> {
  if (await isSupabaseBackendAvailable()) {
    try {
      await apiRemoveSavedTrip(id);
    } catch (error) {
      console.warn('saved trip delete API failed; continuing with local remove', error);
    }
  }
  await localRemoveSavedTrip(id);
}

export async function isTripSaved(
  destinationId: string,
  form: TripSnapshot['form'],
): Promise<boolean> {
  const trips = await listSavedTrips();
  return trips.some(
    (trip) =>
      trip.snapshot.recommendation.destination.id === destinationId &&
      trip.snapshot.form.budgetPerPerson === form.budgetPerPerson &&
      trip.snapshot.form.travelers === form.travelers &&
      trip.snapshot.form.tripLengthDays === form.tripLengthDays,
  );
}
