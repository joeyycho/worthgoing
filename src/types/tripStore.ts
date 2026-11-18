import type { DestinationRecommendation } from './recommendation';
import type { TravelSearchFormState } from './travelSearch';

export const TRIP_SNAPSHOT_VERSION = 1 as const;

/** Prices frozen at save/share time — not live quotes. */
export interface TripSnapshot {
  version: typeof TRIP_SNAPSHOT_VERSION;
  capturedAt: string;
  form: TravelSearchFormState;
  recommendation: DestinationRecommendation;
  /** True when any quote in the snapshot is mock / non-purchase-confirmed */
  isMock: boolean;
  /**
   * `supabase` when persisted via the stage-5 server API.
   * `client-local-mock` when using Apps in Toss Storage / localStorage fallback.
   */
  storageKind: 'client-local-mock' | 'supabase';
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
