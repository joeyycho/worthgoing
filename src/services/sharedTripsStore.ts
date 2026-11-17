import type { SharedTripRecord, TripSnapshot } from '../types/tripStore';
import { createId } from './tripSnapshot';
import { kvGet, kvSet } from './kvStore';

const SHARED_TRIPS_KEY = 'galmanhae.sharedTrips.v1';

/**
 * Client-only MOCK share registry (stage 4).
 * Another device will not see these records until stage 5 (Supabase).
 * Portable links embed the snapshot in the URL query so recipients can still open them.
 */
async function readAll(): Promise<SharedTripRecord[]> {
  const raw = await kvGet(SHARED_TRIPS_KEY);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as SharedTripRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeAll(trips: SharedTripRecord[]): Promise<void> {
  await kvSet(SHARED_TRIPS_KEY, JSON.stringify(trips));
}

export async function rememberSharedTrip(snapshot: TripSnapshot): Promise<SharedTripRecord> {
  const trips = await readAll();
  const record: SharedTripRecord = {
    id: createId('share'),
    createdAt: new Date().toISOString(),
    snapshot,
  };
  await writeAll([record, ...trips].slice(0, 40));
  return record;
}

export async function getSharedTrip(id: string): Promise<SharedTripRecord | null> {
  const trips = await readAll();
  return trips.find((trip) => trip.id === id) ?? null;
}

export function encodeSnapshotPayload(snapshot: TripSnapshot): string {
  const json = JSON.stringify(snapshot);
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function decodeSnapshotPayload(payload: string): TripSnapshot | null {
  try {
    const padded = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padLength = (4 - (padded.length % 4)) % 4;
    const base64 = padded + '='.repeat(padLength);
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const json = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(json) as TripSnapshot;
    if (parsed?.version !== 1 || !parsed.recommendation || !parsed.form) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
