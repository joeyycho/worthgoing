import { compareLocalISODate, isPastLocalDate } from './localDate';

export interface PendingDateRange {
  departureDate: string;
  returnDate: string;
}

export type DateRangeTapPhase = 'pick_departure' | 'pick_return' | 'complete';

export function emptyPendingRange(): PendingDateRange {
  return { departureDate: '', returnDate: '' };
}

export function dateRangePhase(pending: PendingDateRange): DateRangeTapPhase {
  if (!pending.departureDate) {
    return 'pick_departure';
  }
  if (!pending.returnDate) {
    return 'pick_return';
  }
  return 'complete';
}

/**
 * Odd accepted clicks → departure (clear return).
 * Even accepted clicks → return (≥ departure).
 * Invalid clicks (past, return < dep) do not advance the sequence.
 * Opening the picker is not a click; a complete pending range means the next
 * accepted click starts a new departure.
 */
export function applyDateRangeTap(
  pending: PendingDateRange,
  day: string,
  today: string,
): PendingDateRange {
  if (isPastLocalDate(day, today)) {
    return pending;
  }

  const phase = dateRangePhase(pending);

  if (phase === 'pick_departure' || phase === 'complete') {
    return { departureDate: day, returnDate: '' };
  }

  // pick_return — invalid pre-departure does not advance sequence
  if (compareLocalISODate(day, pending.departureDate) < 0) {
    return pending;
  }

  return { departureDate: pending.departureDate, returnDate: day };
}

/** Confirm only when empty (no dates) or both ends set — never mid-replacement. */
export function canConfirmPendingDateRange(pending: PendingDateRange): boolean {
  const phase = dateRangePhase(pending);
  return phase === 'pick_departure' || phase === 'complete';
}

export function isDateRangeDayDisabled(
  day: string,
  pending: PendingDateRange,
  today: string,
): boolean {
  if (isPastLocalDate(day, today)) {
    return true;
  }
  if (dateRangePhase(pending) === 'pick_return' && compareLocalISODate(day, pending.departureDate) < 0) {
    return true;
  }
  return false;
}

export function isDateRangeEndpoint(day: string, pending: PendingDateRange): boolean {
  return day === pending.departureDate || day === pending.returnDate;
}

export function isDateInSelectedRange(day: string, pending: PendingDateRange): boolean {
  if (!pending.departureDate || !pending.returnDate) {
    return false;
  }
  return (
    compareLocalISODate(day, pending.departureDate) >= 0 &&
    compareLocalISODate(day, pending.returnDate) <= 0
  );
}

/** When confirmed departure moves after return, clear return. Same-day is valid. */
export function reconcileReturnWithDeparture(
  departureDate: string,
  returnDate: string,
): string {
  if (!departureDate || !returnDate) {
    return returnDate;
  }
  if (compareLocalISODate(returnDate, departureDate) < 0) {
    return '';
  }
  return returnDate;
}

export function isValidConfirmedDateRange(
  departureDate: string,
  returnDate: string,
  today: string,
): { ok: true } | { ok: false; reason: 'past_departure' | 'return_before_departure' } {
  if (departureDate && isPastLocalDate(departureDate, today)) {
    return { ok: false, reason: 'past_departure' };
  }
  if (departureDate && returnDate && compareLocalISODate(returnDate, departureDate) < 0) {
    return { ok: false, reason: 'return_before_departure' };
  }
  return { ok: true };
}
