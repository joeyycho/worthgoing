import type { SavedTrip, TripSnapshot } from '../types/tripStore';
import { normalizeTripSnapshot } from './normalizeRecommendationSnapshot';
import { createId } from './tripSnapshot';
import { kvGet, kvSet } from './kvStore';

const SAVED_TRIPS_KEY = 'galmanhae.savedTrips.v1';

function withNormalizedSnapshot(trip: SavedTrip): SavedTrip {
  return { ...trip, snapshot: normalizeTripSnapshot(trip.snapshot) };
}

async function readAll(): Promise<SavedTrip[]> {
  const raw = await kvGet(SAVED_TRIPS_KEY);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as SavedTrip[];
    return Array.isArray(parsed) ? parsed.map(withNormalizedSnapshot) : [];
  } catch {
    return [];
  }
}

async function writeAll(trips: SavedTrip[]): Promise<void> {
  await kvSet(SAVED_TRIPS_KEY, JSON.stringify(trips));
}

export async function localListSavedTrips(): Promise<SavedTrip[]> {
  const trips = await readAll();
  return trips.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function localGetSavedTrip(id: string): Promise<SavedTrip | null> {
  const trips = await readAll();
  return trips.find((trip) => trip.id === id) ?? null;
}

export async function localSaveTrip(snapshot: TripSnapshot): Promise<SavedTrip> {
  const trips = await readAll();
  const nextSnapshot: TripSnapshot = { ...snapshot, storageKind: 'client-local-mock' };
  const existing = trips.find(
    (trip) =>
      trip.snapshot.recommendation.destination.id === nextSnapshot.recommendation.destination.id &&
      trip.snapshot.form.budgetPerPerson === nextSnapshot.form.budgetPerPerson &&
      trip.snapshot.form.travelers === nextSnapshot.form.travelers &&
      trip.snapshot.form.tripLengthDays === nextSnapshot.form.tripLengthDays,
  );

  if (existing) {
    const updated: SavedTrip = {
      ...existing,
      createdAt: new Date().toISOString(),
      snapshot: nextSnapshot,
    };
    await writeAll(trips.map((trip) => (trip.id === existing.id ? updated : trip)));
    return updated;
  }

  const next: SavedTrip = {
    id: createId('saved'),
    createdAt: new Date().toISOString(),
    snapshot: nextSnapshot,
  };
  await writeAll([next, ...trips]);
  return next;
}

export async function localRemoveSavedTrip(id: string): Promise<void> {
  const trips = await readAll();
  await writeAll(trips.filter((trip) => trip.id !== id));
}
