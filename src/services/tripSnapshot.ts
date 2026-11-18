import type { DestinationRecommendation } from '../types/recommendation';
import type { TravelSearchFormState } from '../types/travelSearch';
import { TRIP_SNAPSHOT_VERSION, type TripSnapshot } from '../types/tripStore';
import { isApiConfigured } from './api/tripApiClient';

export const PRICE_AS_OF_DISCLAIMER =
  '표시된 가격은 저장·공유 시점 기준이며 확정 구매가가 아닙니다. 지금 시점의 실시간 시세와 다를 수 있어요.';

export function createTripSnapshot(
  form: TravelSearchFormState,
  recommendation: DestinationRecommendation,
  capturedAt = new Date().toISOString(),
): TripSnapshot {
  return {
    version: TRIP_SNAPSHOT_VERSION,
    capturedAt,
    form: structuredClone(form),
    recommendation: structuredClone(recommendation),
    isMock: recommendation.isMock,
    storageKind: isApiConfigured() ? 'supabase' : 'client-local-mock',
  };
}

export function formatCapturedAt(iso: string): string {
  try {
    return new Intl.DateTimeFormat('ko-KR', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  }
  return `${prefix}_${Date.now().toString(36)}`;
}
