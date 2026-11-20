import { useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import {
  BUDGET_MAX,
  BUDGET_MIN,
  BUDGET_STEP,
  DEPARTURE_AIRPORTS,
  INITIAL_TRAVEL_SEARCH,
  TRAVELERS_MAX,
  TRAVELERS_MIN,
  TRIP_LENGTH_MAX,
  TRIP_LENGTH_MIN,
  formatKrw,
} from '../constants/travelSearch';
import type { AirportCode, TravelSearchFormState } from '../types/travelSearch';
import {
  SEARCH_FORM_CTA_HELPER,
  SEARCH_FORM_CTA_LABEL,
} from '../utils/priceProvenance';
import {
  isValidConfirmedDateRange,
  reconcileReturnWithDeparture,
} from '../utils/dateRangeSelection';
import { todayLocalISO } from '../utils/localDate';
import { DateRangePicker } from './DateRangePicker';

type FieldErrorKey = 'tripLengthDays' | 'departureAirports' | 'dateRange';
type ScheduleMode = 'fixed' | 'flexible';

interface TravelSearchScreenProps {
  initialForm?: TravelSearchFormState;
  onSearch: (form: TravelSearchFormState) => void;
}

function inferScheduleMode(form: TravelSearchFormState): ScheduleMode {
  return form.departureDate === '' && form.returnDate === '' ? 'flexible' : 'fixed';
}

export function TravelSearchScreen({ initialForm, onSearch }: TravelSearchScreenProps) {
  const seed = initialForm ?? INITIAL_TRAVEL_SEARCH;
  const [form, setForm] = useState<TravelSearchFormState>(seed);
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>(() => inferScheduleMode(seed));
  const [errors, setErrors] = useState<Partial<Record<FieldErrorKey, string>>>({});
  const [today] = useState(() => todayLocalISO());

  const totalBudget = form.budgetPerPerson * form.travelers;

  const budgetPercent = useMemo(() => {
    return ((form.budgetPerPerson - BUDGET_MIN) / (BUDGET_MAX - BUDGET_MIN)) * 100;
  }, [form.budgetPerPerson]);

  function update<K extends keyof TravelSearchFormState>(key: K, value: TravelSearchFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function toggleAirport(code: AirportCode) {
    setForm((prev) => {
      const selected = prev.departureAirports.includes(code);
      const next = selected
        ? prev.departureAirports.filter((item) => item !== code)
        : [...prev.departureAirports, code];
      return { ...prev, departureAirports: next };
    });
  }

  function setMode(next: ScheduleMode) {
    setScheduleMode(next);
    setErrors((prev) => {
      if (!prev.dateRange) {
        return prev;
      }
      const { dateRange: _removed, ...rest } = prev;
      return rest;
    });
    if (next === 'flexible') {
      setForm((prev) => ({ ...prev, departureDate: '', returnDate: '' }));
    }
  }

  function handleDateConfirm(next: { departureDate: string; returnDate: string }) {
    const returnDate = reconcileReturnWithDeparture(next.departureDate, next.returnDate);
    setForm((prev) => ({
      ...prev,
      departureDate: next.departureDate,
      returnDate,
    }));
    setErrors((prev) => {
      if (!prev.dateRange) {
        return prev;
      }
      const { dateRange: _removed, ...rest } = prev;
      return rest;
    });
  }

  function validate(): boolean {
    const nextErrors: Partial<Record<FieldErrorKey, string>> = {};

    if (
      !Number.isFinite(form.tripLengthDays) ||
      !Number.isInteger(form.tripLengthDays) ||
      form.tripLengthDays < TRIP_LENGTH_MIN ||
      form.tripLengthDays > TRIP_LENGTH_MAX
    ) {
      nextErrors.tripLengthDays = `여행 기간은 ${TRIP_LENGTH_MIN}–${TRIP_LENGTH_MAX}일로 입력해 주세요.`;
    }

    if (form.departureAirports.length === 0) {
      nextErrors.departureAirports = '출발 공항을 하나 이상 선택해 주세요.';
    }

    const rangeCheck = isValidConfirmedDateRange(form.departureDate, form.returnDate, today);
    if (!rangeCheck.ok) {
      nextErrors.dateRange =
        rangeCheck.reason === 'past_departure'
          ? '출발일은 오늘 이후로 선택해 주세요.'
          : '귀국일은 출발일 당일 또는 이후여야 해요.';
    } else if (scheduleMode === 'fixed' && (form.departureDate === '') !== (form.returnDate === '')) {
      nextErrors.dateRange = '출발일과 귀국일을 모두 선택해 주세요.';
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validate()) {
      return;
    }

    const payload: TravelSearchFormState =
      scheduleMode === 'flexible'
        ? { ...form, departureDate: '', returnDate: '' }
        : form;

    onSearch(payload);
  }

  return (
    <form className="travel-search" onSubmit={handleSubmit} noValidate>
      <header className="travel-search-header">
        <p className="brand-eyebrow">여행가지</p>
        <h1 className="page-title">얼마면 여행가지?</h1>
        <p className="page-subtitle">예산과 일정만 알려주시면, 여행지를 찾아 드릴게요.</p>
      </header>

      <section className="form-section" aria-labelledby="budget-heading">
        <div className="section-heading-row">
          <h2 id="budget-heading" className="section-title">
            1인당 예산
          </h2>
          <p className="section-value" aria-live="polite">
            {formatKrw(form.budgetPerPerson)}원
          </p>
        </div>
        <label className="sr-only" htmlFor="budget-slider">
          1인당 예산 (원)
        </label>
        <input
          id="budget-slider"
          className="budget-slider"
          type="range"
          min={BUDGET_MIN}
          max={BUDGET_MAX}
          step={BUDGET_STEP}
          value={form.budgetPerPerson}
          onChange={(event) => update('budgetPerPerson', Number(event.target.value))}
          style={{ '--budget-percent': `${budgetPercent}%` } as CSSProperties}
        />
        <div className="range-meta">
          <span>{formatKrw(BUDGET_MIN)}원</span>
          <span>{formatKrw(BUDGET_MAX)}원</span>
        </div>
      </section>

      <section className="form-section" aria-labelledby="travelers-heading">
        <h2 id="travelers-heading" className="section-title">
          여행 인원
        </h2>
        <div className="stepper" role="group" aria-label="여행 인원">
          <button
            type="button"
            className="stepper-button"
            aria-label="인원 줄이기"
            disabled={form.travelers <= TRAVELERS_MIN}
            onClick={() => update('travelers', Math.max(TRAVELERS_MIN, form.travelers - 1))}
          >
            −
          </button>
          <p className="stepper-value" aria-live="polite">
            {form.travelers}명
          </p>
          <button
            type="button"
            className="stepper-button"
            aria-label="인원 늘리기"
            disabled={form.travelers >= TRAVELERS_MAX}
            onClick={() => update('travelers', Math.min(TRAVELERS_MAX, form.travelers + 1))}
          >
            +
          </button>
        </div>
      </section>

      <section className="form-section total-budget" aria-labelledby="total-budget-heading">
        <h2 id="total-budget-heading" className="section-title">
          총 예산
        </h2>
        <p className="total-budget-value" aria-live="polite">
          {formatKrw(totalBudget)}원
        </p>
        <p className="helper-text">
          1인당 {formatKrw(form.budgetPerPerson)}원 × {form.travelers}명
        </p>
      </section>

      <section className="form-section" aria-labelledby="origin-heading">
        <h2 id="origin-heading" className="section-title">
          출발 국가
        </h2>
        <div className="readonly-field">
          <span>대한민국 (KR)</span>
          <span className="chip-muted">기본값</span>
        </div>
      </section>

      <section className="form-section" aria-labelledby="airport-heading">
        <h2 id="airport-heading" className="section-title">
          출발 공항
        </h2>
        <div className="chip-grid" role="group" aria-labelledby="airport-heading">
          {DEPARTURE_AIRPORTS.map((airport) => {
            const selected = form.departureAirports.includes(airport.code);
            return (
              <button
                key={airport.code}
                type="button"
                className={`chip${selected ? ' is-selected' : ''}`}
                aria-pressed={selected}
                onClick={() => toggleAirport(airport.code)}
              >
                <span className="chip-code">{airport.code}</span>
                <span className="chip-label">
                  {airport.city} · {airport.name}
                </span>
              </button>
            );
          })}
        </div>
        {errors.departureAirports ? (
          <p className="field-error" role="alert">
            {errors.departureAirports}
          </p>
        ) : null}
      </section>

      <section className="form-section" aria-labelledby="length-heading">
        <h2 id="length-heading" className="section-title">
          여행 기간 <span className="required-mark">필수</span>
        </h2>
        <div className="stepper" role="group" aria-label="여행 기간">
          <button
            type="button"
            className="stepper-button"
            aria-label="기간 줄이기"
            disabled={form.tripLengthDays <= TRIP_LENGTH_MIN}
            onClick={() =>
              update('tripLengthDays', Math.max(TRIP_LENGTH_MIN, form.tripLengthDays - 1))
            }
          >
            −
          </button>
          <p className="stepper-value" aria-live="polite">
            {form.tripLengthDays}일
          </p>
          <button
            type="button"
            className="stepper-button"
            aria-label="기간 늘리기"
            disabled={form.tripLengthDays >= TRIP_LENGTH_MAX}
            onClick={() =>
              update('tripLengthDays', Math.min(TRIP_LENGTH_MAX, form.tripLengthDays + 1))
            }
          >
            +
          </button>
        </div>
        {errors.tripLengthDays ? (
          <p id="trip-length-error" className="field-error" role="alert">
            {errors.tripLengthDays}
          </p>
        ) : null}
      </section>

      <section className="form-section" aria-labelledby="dates-heading">
        <h2 id="dates-heading" className="section-title">
          출발 / 귀국일 <span className="optional-mark">선택</span>
        </h2>

        <div className="schedule-mode-grid" role="group" aria-label="일정 유무">
          <button
            type="button"
            className={`chip schedule-mode-chip${scheduleMode === 'fixed' ? ' is-selected' : ''}`}
            aria-pressed={scheduleMode === 'fixed'}
            onClick={() => setMode('fixed')}
          >
            일정이 있어요
          </button>
          <button
            type="button"
            className={`chip schedule-mode-chip${scheduleMode === 'flexible' ? ' is-selected' : ''}`}
            aria-pressed={scheduleMode === 'flexible'}
            onClick={() => setMode('flexible')}
          >
            일정이 없어요
          </button>
        </div>

        {scheduleMode === 'fixed' ? (
          <DateRangePicker
            departureDate={form.departureDate}
            returnDate={form.returnDate}
            onConfirm={handleDateConfirm}
          />
        ) : null}

        {scheduleMode === 'flexible' ? (
          <p className="status-note flexible-note" role="status">
            날짜를 비워 두면 유연 일정으로 찾아 드려요. 실제 항공권 날짜는 별도 확인이 필요해요.
          </p>
        ) : (
          <p className="helper-text">선택한 기간을 기준으로 항공·숙박 가격을 찾아 볼게요.</p>
        )}
        {errors.dateRange ? (
          <p className="field-error" role="alert">
            {errors.dateRange}
          </p>
        ) : null}
      </section>

      <div className="cta-wrap">
        <button type="submit" className="primary-cta">
          {SEARCH_FORM_CTA_LABEL}
        </button>
        <p className="helper-text cta-helper">{SEARCH_FORM_CTA_HELPER}</p>
      </div>
    </form>
  );
}
