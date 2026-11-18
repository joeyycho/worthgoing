import { useState } from 'react';
import { BUDGET_STATUS_LABEL } from '../constants/recommendation';
import { formatKrw } from '../constants/travelSearch';
import { saveTrip } from '../services/savedTripsStore';
import { shareTripSnapshot, type ShareTripResult } from '../services/shareTrip';
import { createTripSnapshot } from '../services/tripSnapshot';
import type { DestinationRecommendation } from '../types/recommendation';
import type { TravelSearchFormState } from '../types/travelSearch';
import {
  FLIGHT_FARE_PRESENT_DISCLAIMER,
  FLIGHT_FARE_UNAVAILABLE,
  flightFareAmountLabel,
} from '../utils/flightFareDisplay';
import { CostBreakdownChart } from './CostBreakdownChart';
import { MockBanner } from './MockBanner';
import { PriceAsOfNote } from './PriceAsOfNote';
import { TripConditionsSummary } from './TripConditionsSummary';

interface DestinationDetailScreenProps {
  item: DestinationRecommendation;
  form: TravelSearchFormState;
  onBack: () => void;
  mode?: 'live' | 'saved' | 'shared';
  capturedAt?: string;
  onDeleteSaved?: () => void;
}

function ListBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="detail-block">
      <h2 className="section-title">{title}</h2>
      <ul className="detail-list">
        {items.map((entry) => (
          <li key={entry}>{entry}</li>
        ))}
      </ul>
    </section>
  );
}

/** Surface tax / nightly qualification fragments already present in stay summary. */
function stayPriceQualification(summary: string): string | null {
  const parts = summary
    .split('·')
    .map((part) => part.trim())
    .filter((part) => /세금|수수료|1박×/.test(part));
  return parts.length > 0 ? parts.join(' · ') : null;
}

export function DestinationDetailScreen({
  item,
  form,
  onBack,
  mode = 'live',
  capturedAt,
  onDeleteSaved,
}: DestinationDetailScreenProps) {
  const { destination, flight, lodging, status, estimatedTotalKrw, remainingKrw, remainingPercent } =
    item;
  const lodgingQualify = stayPriceQualification(lodging.summary);
  const [saveNote, setSaveNote] = useState<string | null>(null);
  const [shareNote, setShareNote] = useState<string | null>(null);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [busy, setBusy] = useState<'save' | 'share' | null>(null);

  const backLabel = mode === 'live' ? '← 목록으로' : '← 돌아가기';

  async function handleSave() {
    setBusy('save');
    setSaveNote(null);
    try {
      const snapshot = createTripSnapshot(form, item);
      await saveTrip(snapshot);
      setSaveNote('저장했어요. “저장한 여행” 탭에서 확인할 수 있어요.');
    } catch (error) {
      setSaveNote(error instanceof Error ? error.message : '저장에 실패했어요.');
    } finally {
      setBusy(null);
    }
  }

  async function handleShare() {
    setBusy('share');
    setShareNote(null);
    setShareLink(null);
    try {
      const snapshot = createTripSnapshot(form, item, capturedAt);
      const result: ShareTripResult = await shareTripSnapshot(snapshot);
      setShareLink(result.sharedLink);
      setShareNote(result.note);
    } catch (error) {
      setShareNote(error instanceof Error ? error.message : '공유에 실패했어요.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <article className="detail-screen">
      <button type="button" className="text-back" onClick={onBack}>
        {backLabel}
      </button>

      <div className="detail-hero">
        <img src={destination.photoUrl} alt={destination.photoAlt} />
        <div className="detail-hero-copy">
          <p className="brand-eyebrow">
            {destination.country} · {destination.city}
          </p>
          <h1 className="page-title">{destination.city}</h1>
          <span className={`budget-badge status-${status}`}>{BUDGET_STATUS_LABEL[status]}</span>
        </div>
      </div>

      <MockBanner />
      <PriceAsOfNote capturedAt={capturedAt} />

      {mode !== 'live' ? <TripConditionsSummary form={form} /> : null}

      <p className="page-subtitle">{destination.intro}</p>

      <section className="detail-summary total-budget">
        <h2 className="section-title">예상 총비용</h2>
        {estimatedTotalKrw == null ? (
          <p className="total-budget-value muted-total">가격 확인 필요</p>
        ) : (
          <p className="total-budget-value">{formatKrw(estimatedTotalKrw)}원</p>
        )}
        <p className="helper-text">
          총 예산 {formatKrw(item.totalBudgetKrw)}원
          {remainingKrw == null || remainingPercent == null
            ? ' · 잔여 예산 미확정'
            : remainingKrw >= 0
              ? ` · 잔여 ${formatKrw(remainingKrw)}원 (${remainingPercent}%)`
              : ` · ${formatKrw(Math.abs(remainingKrw))}원 초과 (${remainingPercent}%)`}
        </p>
      </section>

      {mode === 'live' || mode === 'shared' ? (
        <div className="detail-actions">
          {mode === 'live' ? (
            <button
              type="button"
              className="secondary-cta"
              onClick={() => void handleSave()}
              disabled={busy !== null}
            >
              {busy === 'save' ? '저장 중…' : '이 결과 저장'}
            </button>
          ) : null}
          <button
            type="button"
            className="primary-cta"
            onClick={() => void handleShare()}
            disabled={busy !== null}
          >
            {busy === 'share' ? '공유 준비 중…' : '결과 공유하기'}
          </button>
        </div>
      ) : null}

      {mode === 'saved' ? (
        <div className="detail-actions">
          <button
            type="button"
            className="primary-cta"
            onClick={() => void handleShare()}
            disabled={busy !== null}
          >
            {busy === 'share' ? '공유 준비 중…' : '저장된 결과 공유'}
          </button>
          {onDeleteSaved ? (
            <button type="button" className="secondary-cta danger-cta" onClick={onDeleteSaved}>
              저장 삭제
            </button>
          ) : null}
        </div>
      ) : null}

      {saveNote ? (
        <p className="submit-note" role="status">
          {saveNote}
        </p>
      ) : null}
      {shareNote ? (
        <p className="status-note" role="status">
          {shareNote}
        </p>
      ) : null}
      {shareLink ? (
        <p className="share-link-box">
          <span className="helper-text">공유 링크</span>
          <a className="external-link" href={shareLink} target="_blank" rel="noopener noreferrer">
            {shareLink}
          </a>
        </p>
      ) : null}

      <section className="detail-block">
        <h2 className="section-title">
          항공{' '}
          {flight.isMock
            ? '(예시)'
            : flight.totalFareKrw == null
              ? '(확인불가)'
              : flight.priceMode === 'indicative'
                ? '(예상)'
                : '(실시간)'}
        </h2>
        {flight.isMock ? (
          <p className="mock-banner" role="note">
            <strong>예시</strong> · 항공 요금은 예시이며 구매 확정가가 아닙니다.
          </p>
        ) : flight.totalFareKrw == null ? (
          <p className="status-note" role="note">
            <strong>확인불가</strong> · 검색은 됐지만 확정 가능한 왕복 요금이 없어요. 빈 결과 ≠ 오류.
          </p>
        ) : flight.priceMode === 'indicative' ? (
          <p className="status-note flexible-note" role="note">
            유연 일정·참고용 예상가입니다. 실제 구매 전 날짜를 지정해 다시 검색하세요.
          </p>
        ) : (
          <p className="helper-text" role="note">
            {FLIGHT_FARE_PRESENT_DISCLAIMER} 검색 시각{' '}
            {new Date(flight.searchedAt).toLocaleString('ko-KR')} 기준.
          </p>
        )}
        <p className="detail-strong">
          {flight.totalFareKrw == null
            ? `요금 ${FLIGHT_FARE_UNAVAILABLE}`
            : flightFareAmountLabel(flight.totalFareKrw)}
        </p>
        {flight.stats.offerCount > 0 ? (
          <p className="helper-text">
            최저 {flight.stats.min == null ? '—' : `${formatKrw(flight.stats.min)}원`} · 평균{' '}
            {flight.stats.avg == null ? '—' : `${formatKrw(flight.stats.avg)}원`} · 최고{' '}
            {flight.stats.max == null ? '—' : `${formatKrw(flight.stats.max)}원`} ({flight.stats.offerCount}
            건)
          </p>
        ) : null}
        <p className="helper-text">
          {flight.carrier} · {flight.summary}
          {flight.roundTrip ? ' · 왕복' : ''}
        </p>
        {flight.baggageNotes ? <p className="helper-text">{flight.baggageNotes}</p> : null}
        {flight.bookingUrl ? (
          <a
            className="external-link"
            href={flight.bookingUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            예약/상세 링크 열기
          </a>
        ) : (
          <p className="helper-text">검증된 예약 링크가 없어 표시하지 않아요.</p>
        )}
      </section>

      <section className="detail-block">
        <h2 className="section-title">
          숙소{' '}
          {lodging.isMock
            ? '(예시)'
            : lodging.totalStayKrw == null
              ? '(확인불가)'
              : lodging.priceMode === 'indicative'
                ? '(예상)'
                : '(실시간)'}
        </h2>
        {lodging.isMock ? (
          <p className="mock-banner" role="note">
            <strong>예시</strong> · 숙소 요금은 예시이며 구매 확정가가 아닙니다.
          </p>
        ) : lodging.totalStayKrw == null ? (
          <p className="status-note" role="note">
            <strong>확인불가</strong> · 검색은 됐지만 확정 가능한 숙박 총액이 없어요. 빈 결과 ≠ 오류.
          </p>
        ) : lodging.priceMode === 'indicative' ? (
          <p className="status-note flexible-note" role="note">
            유연 일정·참고용 예상가입니다. 실제 구매 전 체크인 날짜를 지정해 다시 검색하세요.
          </p>
        ) : (
          <p className="helper-text">
            검색 시각 {new Date(lodging.searchedAt).toLocaleString('ko-KR')} 기준 실시간 시세이며
            변동될 수 있어요.
          </p>
        )}
        <p className="detail-strong">
          {lodging.totalStayKrw == null
            ? '요금 확인불가'
            : `총 ${formatKrw(lodging.totalStayKrw)}원`}
        </p>
        {lodging.perPersonStayKrw != null ? (
          <p className="helper-text">1인당 약 {formatKrw(lodging.perPersonStayKrw)}원</p>
        ) : null}
        {lodging.nights > 0 && lodging.totalStayKrw != null ? (
          <p className="helper-text">
            {lodging.nights}박 총액 · 1박 환산 약{' '}
            {formatKrw(Math.round(lodging.totalStayKrw / lodging.nights))}원
            {lodgingQualify ? ` · ${lodgingQualify}` : ''}
          </p>
        ) : null}
        {lodging.stats.offerCount > 0 ? (
          <p className="helper-text">
            최저 {lodging.stats.min == null ? '—' : `${formatKrw(lodging.stats.min)}원`} · 평균{' '}
            {lodging.stats.avg == null ? '—' : `${formatKrw(lodging.stats.avg)}원`} · 최고{' '}
            {lodging.stats.max == null ? '—' : `${formatKrw(lodging.stats.max)}원`} (
            {lodging.stats.offerCount}건)
          </p>
        ) : null}
        <p className="helper-text">
          {lodging.propertyName} · {lodging.summary}
        </p>
        {lodging.bookingUrl ? (
          <a
            className="external-link"
            href={lodging.bookingUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            예약/상세 링크 열기
          </a>
        ) : (
          <p className="helper-text">
            공개 예약 딥링크가 없어 링크를 표시하지 않아요. (검색 시세만 참고)
          </p>
        )}
      </section>

      <CostBreakdownChart breakdown={item.breakdown} />

      <ListBlock title="명소" items={destination.attractions} />
      <ListBlock title="먹거리" items={destination.food} />
      <ListBlock title="액티비티" items={destination.activities} />
      <ListBlock title="쇼핑" items={destination.shopping} />

      <section className="detail-block">
        <h2 className="section-title">샘플 일정</h2>
        <ol className="itinerary-list">
          {destination.sampleItinerary.map((day) => (
            <li key={day.day}>
              <strong>
                Day {day.day}. {day.title}
              </strong>
              <p>{day.detail}</p>
            </li>
          ))}
        </ol>
      </section>
    </article>
  );
}
