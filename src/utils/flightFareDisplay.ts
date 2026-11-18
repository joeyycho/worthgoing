import { formatKrw } from '../constants/travelSearch';

/** Null fare copy — never invent Mock amounts when live search returned null. */
export const FLIGHT_FARE_UNAVAILABLE = '확인불가';

/**
 * Disclaimer when a SerpApi (or other live) round-trip fare is shown.
 * Observed unlock is estimate-only; taxes/booking may differ.
 */
export const FLIGHT_FARE_PRESENT_DISCLAIMER =
  '예상 왕복 항공료 · 검색 당시 표시 가격이며 예약 단계에서 변동·세금이 달라질 수 있어요.';

/** Amount line for cards/detail: formatted KRW or 확인불가. */
export function flightFareAmountLabel(totalFareKrw: number | null): string {
  if (totalFareKrw == null) return FLIGHT_FARE_UNAVAILABLE;
  return `${formatKrw(totalFareKrw)}원`;
}
