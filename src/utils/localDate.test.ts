import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  addLocalMonths,
  buildMonthGrid,
  compareLocalISODate,
  formatLocalISODate,
  isPastLocalDate,
  isIsoDateString,
  todayLocalISO,
} from './localDate.js';

describe('localDate (QA-07 local calendar)', () => {
  it('formats local ISO without UTC shift', () => {
    const d = new Date(2026, 10, 19, 23, 30, 0);
    assert.equal(formatLocalISODate(d), '2026-11-19');
  });

  it('todayLocalISO uses local calendar day', () => {
    const fixed = new Date(2026, 0, 5, 1, 2, 3);
    assert.equal(todayLocalISO(fixed), '2026-01-05');
  });

  it('rejects invalid calendar dates', () => {
    assert.equal(isIsoDateString('2026-02-30'), false);
    assert.equal(isIsoDateString('2026-11-19'), true);
  });

  it('compare and past checks', () => {
    assert.equal(compareLocalISODate('2026-11-18', '2026-11-19'), -1);
    assert.equal(isPastLocalDate('2026-11-18', '2026-11-19'), true);
    assert.equal(isPastLocalDate('2026-11-19', '2026-11-19'), false);
  });

  it('addLocalMonths clamps end-of-month', () => {
    assert.equal(addLocalMonths('2026-01-31', 1), '2026-02-28');
  });

  it('buildMonthGrid starts on Sunday and fills weeks', () => {
    const grid = buildMonthGrid('2026-11-01');
    assert.equal(grid.length % 7, 0);
    assert.equal(grid.includes('2026-11-01'), true);
    assert.equal(grid.includes('2026-11-30'), true);
  });
});
