/** Local-calendar helpers (YYYY-MM-DD). Avoid UTC midnight shifts. */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDateString(value: string): boolean {
  if (!ISO_DATE.test(value)) {
    return false;
  }
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

export function formatLocalISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Today's date in the runtime local timezone. */
export function todayLocalISO(now: Date = new Date()): string {
  return formatLocalISODate(now);
}

export function parseLocalISODate(iso: string): Date {
  if (!isIsoDateString(iso)) {
    throw new Error(`Invalid local ISO date: ${iso}`);
  }
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function compareLocalISODate(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}

export function isPastLocalDate(iso: string, today: string = todayLocalISO()): boolean {
  return compareLocalISODate(iso, today) < 0;
}

export function addLocalMonths(isoYearMonthDay: string, deltaMonths: number): string {
  const date = parseLocalISODate(isoYearMonthDay);
  const day = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() + deltaMonths);
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(day, lastDay));
  return formatLocalISODate(date);
}

export function startOfLocalMonth(iso: string): string {
  const date = parseLocalISODate(iso);
  date.setDate(1);
  return formatLocalISODate(date);
}

export function formatDisplayDate(iso: string): string {
  if (!iso) {
    return '';
  }
  const date = parseLocalISODate(iso);
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(date);
}

export function monthLabel(iso: string): string {
  const date = parseLocalISODate(iso);
  return new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long' }).format(date);
}

/** Build the 6×7 grid of ISO dates for the month containing `monthCursor` (any day in month). */
export function buildMonthGrid(monthCursor: string): Array<string | null> {
  const first = parseLocalISODate(startOfLocalMonth(monthCursor));
  const year = first.getFullYear();
  const month = first.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startWeekday = first.getDay(); // 0=Sun
  const cells: Array<string | null> = [];

  for (let i = 0; i < startWeekday; i += 1) {
    cells.push(null);
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(formatLocalISODate(new Date(year, month, day)));
  }
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }
  return cells;
}
