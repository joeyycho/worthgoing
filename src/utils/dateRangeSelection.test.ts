import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyDateRangeTap,
  dateRangePhase,
  emptyPendingRange,
  isDateInSelectedRange,
  isDateRangeDayDisabled,
  isValidConfirmedDateRange,
  reconcileReturnWithDeparture,
} from './dateRangeSelection.js';

const TODAY = '2026-11-19';

describe('dateRangeSelection (QA-07..10)', () => {
  it('first tap sets departure; second sets return; third restarts', () => {
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

  it('reset empties pending; reconcile clears invalid return', () => {
    assert.deepEqual(emptyPendingRange(), { departureDate: '', returnDate: '' });
    assert.equal(reconcileReturnWithDeparture('2026-11-25', '2026-11-20'), '');
    assert.equal(reconcileReturnWithDeparture('2026-11-20', '2026-11-20'), '2026-11-20');
  });

  it('validation blocks past departure and inverted range', () => {
    assert.equal(isValidConfirmedDateRange('2026-11-18', '2026-11-20', TODAY).ok, false);
    assert.equal(isValidConfirmedDateRange('2026-11-22', '2026-11-20', TODAY).ok, false);
    assert.equal(isValidConfirmedDateRange('2026-11-20', '2026-11-22', TODAY).ok, true);
    assert.equal(isValidConfirmedDateRange('', '', TODAY).ok, true);
  });
});
