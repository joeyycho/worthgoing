import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyDateRangeTap,
  canConfirmPendingDateRange,
  dateRangePhase,
  emptyPendingRange,
  isDateInSelectedRange,
  isDateRangeDayDisabled,
  isValidConfirmedDateRange,
  reconcileReturnWithDeparture,
} from './dateRangeSelection.js';

const TODAY = '2026-11-19';

describe('dateRangeSelection (QA-07..10 + GAL-61-04)', () => {
  it('odd/even accepted clicks: dep → ret → new dep → ret', () => {
    let pending = emptyPendingRange();
    assert.equal(dateRangePhase(pending), 'pick_departure');

    pending = applyDateRangeTap(pending, '2026-11-20', TODAY);
    assert.deepEqual(pending, { departureDate: '2026-11-20', returnDate: '' });
    assert.equal(dateRangePhase(pending), 'pick_return');

    pending = applyDateRangeTap(pending, '2026-11-25', TODAY);
    assert.deepEqual(pending, { departureDate: '2026-11-20', returnDate: '2026-11-25' });
    assert.equal(dateRangePhase(pending), 'complete');

    pending = applyDateRangeTap(pending, '2026-12-01', TODAY);
    assert.deepEqual(pending, { departureDate: '2026-12-01', returnDate: '' });
  });

  it('GAL-61-04 example sequence from Nov 20 2026', () => {
    const today = '2026-11-20';
    // Open with empty — opening is not a click
    let pending = emptyPendingRange();
    assert.equal(canConfirmPendingDateRange(pending), true);

    pending = applyDateRangeTap(pending, '2026-11-25', today); // odd → dep
    assert.deepEqual(pending, { departureDate: '2026-11-25', returnDate: '' });
    assert.equal(canConfirmPendingDateRange(pending), false);

    pending = applyDateRangeTap(pending, '2026-11-29', today); // even → ret
    assert.deepEqual(pending, { departureDate: '2026-11-25', returnDate: '2026-11-29' });
    assert.equal(canConfirmPendingDateRange(pending), true);

    pending = applyDateRangeTap(pending, '2026-12-03', today); // odd → new dep
    assert.deepEqual(pending, { departureDate: '2026-12-03', returnDate: '' });
    assert.equal(canConfirmPendingDateRange(pending), false);

    pending = applyDateRangeTap(pending, '2026-12-07', today); // even → ret
    assert.deepEqual(pending, { departureDate: '2026-12-03', returnDate: '2026-12-07' });

    pending = applyDateRangeTap(pending, '2026-12-10', today); // odd → new dep
    assert.deepEqual(pending, { departureDate: '2026-12-10', returnDate: '' });

    const ignored = applyDateRangeTap(pending, '2026-12-08', today); // invalid < dep
    assert.deepEqual(ignored, pending);

    pending = applyDateRangeTap(pending, '2026-12-14', today); // even → ret
    assert.deepEqual(pending, { departureDate: '2026-12-10', returnDate: '2026-12-14' });
    assert.equal(canConfirmPendingDateRange(pending), true);
  });

  it('allows same-day return', () => {
    let pending = applyDateRangeTap(emptyPendingRange(), '2026-11-20', TODAY);
    pending = applyDateRangeTap(pending, '2026-11-20', TODAY);
    assert.deepEqual(pending, { departureDate: '2026-11-20', returnDate: '2026-11-20' });
  });

  it('ignores past days and pre-departure while picking return', () => {
    let pending = applyDateRangeTap(emptyPendingRange(), '2026-11-18', TODAY);
    assert.deepEqual(pending, emptyPendingRange());

    pending = applyDateRangeTap(emptyPendingRange(), '2026-11-22', TODAY);
    const ignored = applyDateRangeTap(pending, '2026-11-21', TODAY);
    assert.deepEqual(ignored, pending);

    assert.equal(isDateRangeDayDisabled('2026-11-18', pending, TODAY), true);
    assert.equal(isDateRangeDayDisabled('2026-11-21', pending, TODAY), true);
    assert.equal(isDateRangeDayDisabled('2026-11-22', pending, TODAY), false);
  });

  it('range highlight includes endpoints', () => {
    const pending = { departureDate: '2026-11-20', returnDate: '2026-11-22' };
    assert.equal(isDateInSelectedRange('2026-11-20', pending), true);
    assert.equal(isDateInSelectedRange('2026-11-21', pending), true);
    assert.equal(isDateInSelectedRange('2026-11-22', pending), true);
    assert.equal(isDateInSelectedRange('2026-11-23', pending), false);
  });

  it('reconcile clears invalid return; confirm rules for incomplete', () => {
    assert.deepEqual(emptyPendingRange(), { departureDate: '', returnDate: '' });
    assert.equal(reconcileReturnWithDeparture('2026-11-25', '2026-11-20'), '');
    assert.equal(reconcileReturnWithDeparture('2026-11-20', '2026-11-20'), '2026-11-20');
    assert.equal(canConfirmPendingDateRange({ departureDate: '', returnDate: '' }), true);
    assert.equal(canConfirmPendingDateRange({ departureDate: '2026-11-20', returnDate: '' }), false);
    assert.equal(
      canConfirmPendingDateRange({ departureDate: '2026-11-20', returnDate: '2026-11-22' }),
      true,
    );
  });

  it('validation blocks past departure and inverted range', () => {
    assert.equal(isValidConfirmedDateRange('2026-11-18', '2026-11-20', TODAY).ok, false);
    assert.equal(isValidConfirmedDateRange('2026-11-22', '2026-11-20', TODAY).ok, false);
    assert.equal(isValidConfirmedDateRange('2026-11-20', '2026-11-22', TODAY).ok, true);
    assert.equal(isValidConfirmedDateRange('', '', TODAY).ok, true);
  });
});
