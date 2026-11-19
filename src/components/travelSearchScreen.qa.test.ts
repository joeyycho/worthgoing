import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

function readSrc(relativePath: string): string {
  return readFileSync(join(root, relativePath), 'utf8');
}

describe('Travel conditions UI QA-01..11 (source contracts)', () => {
  const screen = readSrc('src/components/TravelSearchScreen.tsx');
  const picker = readSrc('src/components/DateRangePicker.tsx');
  const css = readSrc('src/App.css');
  const packageJson = readSrc('package.json');
  const aitConfig = readSrc('apps-in-toss.config.ts');

  it('QA-01..03 user-visible brand/title/subtitle', () => {
    assert.match(screen, /여행가지/);
    assert.match(screen, /얼마면 여행가지\?/);
    assert.match(
      screen,
      /예산과 일정만 알려주시면, 여행지를 찾아 드릴게요\./,
    );
    assert.ok(!screen.includes('갈만해'));
    assert.ok(!screen.includes('갈 만한'));
  });

  it('QA-04 scoped primary accent #B166D3 on travel-search only', () => {
    assert.match(css, /\.travel-search\s*\{[^}]*--accent:\s*#b166d3/i);
    assert.ok(!css.includes('.app-shell {\n  --accent: #b166d3'));
    assert.match(css, /\.app-shell\s*\{[^}]*--accent:\s*#3182f6/s);
  });

  it('QA-05 date trigger wraps without overflow clip-only hack as sole fix', () => {
    assert.match(css, /\.date-range-trigger-value[\s\S]*overflow-wrap:\s*anywhere/);
    assert.match(css, /\.date-range-picker[\s\S]*min-width:\s*0/);
    assert.ok(!screen.includes('type="date"'));
  });

  it('QA-06 schedule mode precedes date controls; flexible clears dates', () => {
    const modeIdx = screen.indexOf('일정이 있어요');
    const flexibleIdx = screen.indexOf('일정이 없어요');
    const pickerIdx = screen.indexOf('<DateRangePicker');
    assert.ok(modeIdx > 0 && flexibleIdx > modeIdx);
    assert.ok(pickerIdx > flexibleIdx);
    assert.match(screen, /departureDate:\s*'',\s*returnDate:\s*''/);
    assert.match(screen, /scheduleMode === 'flexible'/);
  });

  it('QA-09..10 + GAL-61-04 cancel/confirm without reset; incomplete disables confirm', () => {
    assert.ok(!picker.includes('리셋'));
    assert.ok(!picker.includes('handleReset'));
    assert.match(picker, /취소/);
    assert.match(picker, /확인/);
    assert.match(picker, /handleCancel/);
    assert.match(picker, /handleConfirm/);
    assert.match(picker, /canConfirmPendingDateRange/);
    assert.match(picker, /disabled=\{!canConfirm\}/);
    assert.match(picker, /onConfirm\(\{[\s\S]*pending\.departureDate/);
    assert.match(picker, /setPending\(\{ departureDate, returnDate \}\)/);
    assert.match(css, /\.date-range-actions\s*\{[\s\S]*grid-template-columns:\s*1fr 1\.2fr/);
  });

  it('QA-11 duration stepper bounds 1–30 without numeric keypad', () => {
    assert.match(screen, /aria-label="여행 기간"/);
    assert.match(screen, /기간 줄이기/);
    assert.match(screen, /기간 늘리기/);
    assert.match(screen, /TRIP_LENGTH_MIN/);
    assert.match(screen, /TRIP_LENGTH_MAX/);
    assert.ok(!screen.includes('id="trip-length"'));
    assert.ok(!screen.includes('type="number"'));
    assert.ok(!screen.includes('inputMode="numeric"'));
  });

  it('does not rename package / AIT app identifiers', () => {
    assert.match(packageJson, /"name":\s*"galman-hae"/);
    assert.match(aitConfig, /galman/);
  });
});

describe('Travel conditions UX follow-up GAL-61-01..04', () => {
  const screen = readSrc('src/components/TravelSearchScreen.tsx');
  const picker = readSrc('src/components/DateRangePicker.tsx');

  it('GAL-61-01 hides visible 1–30일 helper; keeps stepper bounds logic', () => {
    assert.ok(!screen.includes('trip-length-help'));
    assert.ok(!screen.includes('{TRIP_LENGTH_MIN}–{TRIP_LENGTH_MAX}일'));
    assert.ok(!/\d+–\d+일/.test(screen));
    assert.match(screen, /form\.tripLengthDays <= TRIP_LENGTH_MIN/);
    assert.match(screen, /form\.tripLengthDays >= TRIP_LENGTH_MAX/);
  });

  it('GAL-61-02 flexible yellow copy without 참고용 or duplicate helper', () => {
    assert.ok(!screen.includes('날짜 선택 없이 유연 일정으로 찾아 드려요'));
    assert.ok(!screen.includes('(참고용)'));
    assert.ok(!screen.includes('참고용'));
    assert.match(
      screen,
      /날짜를 비워 두면 유연 일정으로 찾아 드려요\. 실제 항공권 날짜는 별도 확인이 필요해요\./,
    );
    assert.match(screen, /flexible-note/);
  });

  it('GAL-61-03 complete-range instruction is 이 일정이 맞나요?', () => {
    assert.match(picker, /이 일정이 맞나요\?/);
    assert.ok(!picker.includes('일정을 확인한 뒤'));
    assert.ok(!picker.includes('적용하세요'));
  });

  it('GAL-61-04 odd/even helpers wired; cancel restores confirmed', () => {
    assert.match(picker, /applyDateRangeTap/);
    assert.match(picker, /Opening is not a click/);
    assert.match(picker, /handleCancel[\s\S]*setPending\(\{ departureDate, returnDate \}\)/);
    assert.match(picker, /if \(!canConfirmPendingDateRange\(pending\)\)/);
  });
});
