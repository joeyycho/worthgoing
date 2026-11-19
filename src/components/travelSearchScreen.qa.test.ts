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

  it('QA-09..10 range picker confirm/cancel/reset pending vs confirmed', () => {
    assert.match(picker, /리셋/);
    assert.match(picker, /취소/);
    assert.match(picker, /확인/);
    assert.match(picker, /handleReset/);
    assert.match(picker, /handleCancel/);
    assert.match(picker, /handleConfirm/);
    assert.match(picker, /setPending\(emptyPendingRange\(\)\)/);
    assert.match(picker, /onConfirm\(\{[\s\S]*pending\.departureDate/);
    assert.match(picker, /setPending\(\{ departureDate, returnDate \}\)/);
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
