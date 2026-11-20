import { useId, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  applyDateRangeTap,
  canConfirmPendingDateRange,
  dateRangePhase,
  isDateInSelectedRange,
  isDateRangeDayDisabled,
  isDateRangeEndpoint,
  type PendingDateRange,
} from '../utils/dateRangeSelection';
import {
  addLocalMonths,
  buildMonthGrid,
  formatDisplayDate,
  monthLabel,
  startOfLocalMonth,
  todayLocalISO,
} from '../utils/localDate';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export interface DateRangePickerProps {
  departureDate: string;
  returnDate: string;
  onConfirm: (next: { departureDate: string; returnDate: string }) => void;
  disabled?: boolean;
}

export function DateRangePicker({
  departureDate,
  returnDate,
  onConfirm,
  disabled = false,
}: DateRangePickerProps) {
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [today] = useState(() => todayLocalISO());
  const [pending, setPending] = useState<PendingDateRange>(() => ({
    departureDate,
    returnDate,
  }));
  const [monthCursor, setMonthCursor] = useState(() =>
    startOfLocalMonth(departureDate || today),
  );

  const phase = dateRangePhase(pending);
  const canConfirm = canConfirmPendingDateRange(pending);
  const grid = buildMonthGrid(monthCursor);

  const summary =
    departureDate && returnDate
      ? `${formatDisplayDate(departureDate)} ~ ${formatDisplayDate(returnDate)}`
      : departureDate
        ? `${formatDisplayDate(departureDate)} ~ 귀국일 선택`
        : '출발일과 귀국일을 선택해 주세요';

  const pendingSummary =
    pending.departureDate && pending.returnDate
      ? `${formatDisplayDate(pending.departureDate)} ~ ${formatDisplayDate(pending.returnDate)}`
      : pending.departureDate
        ? `${formatDisplayDate(pending.departureDate)} · 귀국일을 선택하세요`
        : '날짜를 선택하세요';

  function openPicker() {
    if (disabled) {
      return;
    }
    // Opening is not a click — seed pending from confirmed only.
    setPending({ departureDate, returnDate });
    setMonthCursor(startOfLocalMonth(departureDate || today));
    setOpen(true);
  }

  function handleCancel() {
    setPending({ departureDate, returnDate });
    setOpen(false);
  }

  function handleConfirm() {
    if (!canConfirmPendingDateRange(pending)) {
      return;
    }
    onConfirm({
      departureDate: pending.departureDate,
      returnDate: pending.returnDate,
    });
    setOpen(false);
  }

  function handleDayClick(day: string) {
    if (isDateRangeDayDisabled(day, pending, today)) {
      return;
    }
    setPending((prev) => applyDateRangeTap(prev, day, today));
  }

  return (
    <div className="date-range-picker">
      <button
        type="button"
        className="date-range-trigger"
        onClick={openPicker}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className="date-range-trigger-label">선택한 일정</span>
        <span className="date-range-trigger-value">{summary}</span>
      </button>

      {open
        ? createPortal(
            <div className="date-range-overlay" role="presentation" onClick={handleCancel}>
              <div
                className="date-range-sheet"
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                onClick={(event) => event.stopPropagation()}
              >
                <div className="date-range-sheet-body">
                  <header className="date-range-sheet-header">
                    <h3 id={titleId} className="date-range-sheet-title">
                      여행 일정
                    </h3>
                    <p className="date-range-sheet-pending" aria-live="polite">
                      {pendingSummary}
                    </p>
                    <p className="date-range-sheet-hint">
                      {phase === 'pick_departure'
                        ? '출발일을 선택하세요'
                        : phase === 'pick_return'
                          ? '귀국일을 선택하세요'
                          : '이 일정이 맞나요?'}
                    </p>
                  </header>

                  <div className="date-range-month-nav">
                    <button
                      type="button"
                      className="date-range-nav-button"
                      aria-label="이전 달"
                      onClick={() => setMonthCursor((prev) => addLocalMonths(prev, -1))}
                    >
                      ‹
                    </button>
                    <p className="date-range-month-label">{monthLabel(monthCursor)}</p>
                    <button
                      type="button"
                      className="date-range-nav-button"
                      aria-label="다음 달"
                      onClick={() => setMonthCursor((prev) => addLocalMonths(prev, 1))}
                    >
                      ›
                    </button>
                  </div>

                  <div className="date-range-weekdays" aria-hidden="true">
                    {WEEKDAYS.map((label) => (
                      <span key={label}>{label}</span>
                    ))}
                  </div>

                  <div className="date-range-grid" role="grid" aria-label="날짜 선택">
                    {grid.map((day, index) => {
                      if (!day) {
                        return <span key={`empty-${index}`} className="date-range-cell is-empty" />;
                      }

                      const disabledDay = isDateRangeDayDisabled(day, pending, today);
                      const inRange = isDateInSelectedRange(day, pending);
                      const isDeparture = day === pending.departureDate;
                      const isReturn = day === pending.returnDate;
                      const isEndpoint = isDateRangeEndpoint(day, pending);
                      const isToday = day === today;

                      return (
                        <button
                          key={day}
                          type="button"
                          role="gridcell"
                          className={[
                            'date-range-cell',
                            disabledDay ? 'is-disabled' : '',
                            inRange ? 'is-in-range' : '',
                            isEndpoint ? 'is-endpoint' : '',
                            isDeparture ? 'is-departure' : '',
                            isReturn ? 'is-return' : '',
                            isToday ? 'is-today' : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          disabled={disabledDay}
                          aria-label={day}
                          aria-pressed={isEndpoint}
                          onClick={() => handleDayClick(day)}
                        >
                          {Number(day.slice(-2))}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="date-range-actions">
                  <button type="button" className="date-range-secondary" onClick={handleCancel}>
                    취소
                  </button>
                  <button
                    type="button"
                    className="date-range-confirm"
                    onClick={handleConfirm}
                    disabled={!canConfirm}
                  >
                    확인
                  </button>
                </div>
              </div>
            </div>,
            document.querySelector('.app-shell') ?? document.body,
          )
        : null}
    </div>
  );
}
