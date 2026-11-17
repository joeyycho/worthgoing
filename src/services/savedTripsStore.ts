import type { SavedTrip, TripSnapshot } from '../types/tripStore';
import { createId } from './tripSnapshot';
import { kvGet, kvSet } from './kvStore';

const SAVED_TRIPS_KEY = 'galmanhae.savedTrips.v1';

async function readAll(): Promise<SavedTrip[]> {
  const raw = await kvGet(SAVED_TRIPS_KEY);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as SavedTrip[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeAll(trips: SavedTrip[]): Promise<void> {
  await kvSet(SAVED_TRIPS_KEY, JSON.stringify(trips));
}

export async function listSavedTrips(): Promise<SavedTrip[]> {
  const trips = await readAll();
  return trips.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getSavedTrip(id: string): Promise<SavedTrip | null> {
  const trips = await readAll();
  return trips.find((trip) => trip.id === id) ?? null;
}

export async function saveTrip(snapshot: TripSnapshot): Promise<SavedTrip> {
  const trips = await readAll();
  const existing = trips.find(
    (trip) =>
      trip.snapshot.recommendation.destination.id === snapshot.recommendation.destination.id &&
      trip.snapshot.form.budgetPerPerson === snapshot.form.budgetPerPerson &&
      trip.snapshot.form.travelers === snapshot.form.travelers &&
      trip.snapshot.form.tripLengthDays === snapshot.form.tripLengthDays,
  );

  if (existing) {
    const updated: SavedTrip = {
      ...existing,
      createdAt: new Date().toISOString(),
      snapshot,
    };
    await writeAll(trips.map((trip) => (trip.id === existing.id ? updated : trip)));
    return updated;
  }

  const next: SavedTrip = {
    id: createId('saved'),
    createdAt: new Date().toISOString(),
    snapshot,
  };
  await writeAll([next, ...trips]);
  return next;
}

export async function removeSavedTrip(id: string): Promise<void> {
  const trips = await readAll();
  await writeAll(trips.filter((trip) => trip.id !== id));
}

export async function isTripSaved(
  destinationId: string,
  form: TripSnapshot['form'],
): Promise<boolean> {
  const trips = await readAll();
  return trips.some(
    (trip) =>
      trip.snapshot.recommendation.destination.id === destinationId &&
      trip.snapshot.form.budgetPerPerson === form.budgetPerPerson &&
      trip.snapshot.form.travelers === form.travelers &&
      trip.snapshot.form.tripLengthDays === form.tripLengthDays,
  );
}
