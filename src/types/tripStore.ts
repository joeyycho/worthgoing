import type { DestinationRecommendation } from './recommendation';
import type { TravelSearchFormState } from './travelSearch';

export const TRIP_SNAPSHOT_VERSION = 1 as const;

/** Prices frozen at save/share time — not live quotes. */
export interface TripSnapshot {
  version: typeof TRIP_SNAPSHOT_VERSION;
  capturedAt: string;
  form: TravelSearchFormState;
  recommendation: DestinationRecommendation;
  /** Always true while stage 3 mock providers are in use */
  isMock: true;
  /**
   * Until Supabase (stage 5), share payloads are client-only / MOCK durable storage.
   * Portable share links may embed the snapshot in the URL query.
   */
  storageKind: 'client-local-mock';
}

export interface SavedTrip {
  id: string;
  createdAt: string;
  snapshot: TripSnapshot;
}

export interface SharedTripRecord {
  id: string;
  createdAt: string;
  snapshot: TripSnapshot;
}
