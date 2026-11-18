import type { SavedTrip, SharedTripRecord, TripSnapshot } from '../../types/tripStore';
import { getClientUserKey } from '../userKey';

export function isApiConfigured(): boolean {
  return Boolean(import.meta.env?.VITE_API_BASE_URL);
}

function apiBase(): string {
  const base = import.meta.env.VITE_API_BASE_URL;
  if (!base) {
    throw new Error('VITE_API_BASE_URL is not set');
  }
  return base.replace(/\/$/, '');
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const userKey = await getClientUserKey();
  const response = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-User-Key': userKey,
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    let message = `API ${response.status}`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export async function apiListSavedTrips(): Promise<SavedTrip[]> {
  const data = await apiFetch<{ trips: SavedTrip[] }>('/api/saved-trips');
  return data.trips;
}

export async function apiSaveTrip(snapshot: TripSnapshot): Promise<SavedTrip> {
  const data = await apiFetch<{ trip: SavedTrip }>('/api/saved-trips', {
    method: 'POST',
    body: JSON.stringify({ snapshot: { ...snapshot, storageKind: 'supabase' } }),
  });
  return data.trip;
}

export async function apiRemoveSavedTrip(id: string): Promise<void> {
  await apiFetch<void>(`/api/saved-trips/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function apiCreateSharedTrip(snapshot: TripSnapshot): Promise<SharedTripRecord> {
  const data = await apiFetch<{ trip: SharedTripRecord }>('/api/shared-trips', {
    method: 'POST',
    body: JSON.stringify({ snapshot: { ...snapshot, storageKind: 'supabase' } }),
  });
  return data.trip;
}

export async function apiGetSharedTrip(token: string): Promise<SharedTripRecord | null> {
  try {
    const data = await apiFetch<{ trip: SharedTripRecord }>(
      `/api/shared-trips/${encodeURIComponent(token)}`,
    );
    return data.trip;
  } catch (error) {
    if (error instanceof Error && /404|not found/i.test(error.message)) {
      return null;
    }
    throw error;
  }
}

export async function apiHealth(): Promise<{ ok: boolean; supabaseConfigured: boolean } | null> {
  if (!isApiConfigured()) return null;
  try {
    const response = await fetch(`${apiBase()}/health`);
    if (!response.ok) return null;
    return (await response.json()) as { ok: boolean; supabaseConfigured: boolean };
  } catch {
    return null;
  }
}
