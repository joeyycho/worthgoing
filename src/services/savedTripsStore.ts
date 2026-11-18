import type { SavedTrip, TripSnapshot } from '../types/tripStore';
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

export async function saveTrip(snapshot: TripSnapshot): Promise<SavedTrip> {
  if (await isSupabaseBackendAvailable()) {
    try {
      return await apiSaveTrip(snapshot);
    } catch (error) {
      console.warn('saved trip save API failed; falling back to local store', error);
    }
  }
  return localSaveTrip(snapshot);
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
