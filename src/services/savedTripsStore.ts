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
import { normalizeTripSnapshot } from './normalizeRecommendationSnapshot';
import { SAVE_FAIL } from './saveTripMessages';

export {
  SAVE_FAIL,
  SAVE_SUCCESS_CLOUD,
  SAVE_SUCCESS_LOCAL,
  SAVE_SUCCESS_LOCAL_AFTER_CLOUD_FAIL,
  saveSuccessMessage,
} from './saveTripMessages';

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
 */
export async function listSavedTrips(): Promise<SavedTrip[]> {
  if (await isSupabaseBackendAvailable()) {
    try {
      return (await apiListSavedTrips()).map(withNormalizedSnapshot);
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
      return hit ? withNormalizedSnapshot(hit) : null;
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

export async function removeSavedTrip(id: string): Promise<void> {
  if (await isSupabaseBackendAvailable()) {
    try {
      await apiRemoveSavedTrip(id);
      return;
    } catch (error) {
      console.warn('saved trip delete API failed; falling back to local store', error);
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
