import type { SharedTripRecord, TripSnapshot } from '../types/tripStore';
import {
  apiCreateSharedTrip,
  apiGetSharedTrip,
  apiHealth,
  isApiConfigured,
} from './api/tripApiClient';
import {
  decodeSnapshotPayload,
  encodeSnapshotPayload,
  localGetSharedTrip,
  localRememberSharedTrip,
} from './localSharedTripsStore';

export { decodeSnapshotPayload, encodeSnapshotPayload };

async function isSupabaseBackendAvailable(): Promise<boolean> {
  if (!isApiConfigured()) {
    return false;
  }
  const health = await apiHealth();
  return Boolean(health?.ok && health.supabaseConfigured);
}

/**
 * Adapter: create/read shared trips via server when Supabase is configured.
 * Falls back to client-local MOCK registry (stage 4). Portable URL payloads still work either way.
 */
export async function rememberSharedTrip(snapshot: TripSnapshot): Promise<SharedTripRecord> {
  if (await isSupabaseBackendAvailable()) {
    try {
      return await apiCreateSharedTrip(snapshot);
    } catch (error) {
      console.warn('shared trip create API failed; falling back to local store', error);
    }
  }
  return localRememberSharedTrip(snapshot);
}

export async function getSharedTrip(id: string): Promise<SharedTripRecord | null> {
  if (await isSupabaseBackendAvailable()) {
    try {
      const remote = await apiGetSharedTrip(id);
      if (remote) {
        return remote;
      }
    } catch (error) {
      console.warn('shared trip get API failed; falling back to local store', error);
    }
  }
  return localGetSharedTrip(id);
}
