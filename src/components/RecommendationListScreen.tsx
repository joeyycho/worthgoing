import { SORT_OPTIONS } from '../constants/recommendation';
import { formatKrw } from '../constants/travelSearch';
import type { DestinationRecommendation, RecommendationSort } from '../types/recommendation';
import type { TravelSearchFormState } from '../types/travelSearch';
import { DestinationCard } from './DestinationCard';
import { MockBanner } from './MockBanner';

interface RecommendationListScreenProps {
  form: TravelSearchFormState;
  items: DestinationRecommendation[];
  sort: RecommendationSort;
  loading: boolean;
  error: string | null;
  onSortChange: (sort: RecommendationSort) => void;
  onSelect: (id: string) => void;
  onBack: () => void;
  onRetry: () => void;
}

export function RecommendationListScreen({
  form,
  items,
  sort,
  loading,
  error,
  onSortChange,
  onSelect,
  onBack,
  onRetry,
}: RecommendationListScreenProps) {
  const totalBudget = form.budgetPerPerson * form.travelers;
  const flexible = form.departureDate === '' && form.returnDate === '';

  return (
    <section className="results-screen">
      <header className="results-header">
        <button type="button" className="text-back" onClick={onBack}>
          ← 조건 수정
        </button>
        <h1 className="page-title">갈 만한 여행지</h1>
        <p className="page-subtitle">
          총 예산 {formatKrw(totalBudget)}원 · {form.travelers}명 · {form.tripLengthDays}일
          {flexible ? ' · 유연 일정' : ''}
        </p>
      </header>

      <MockBanner />
      {items.some((item) => item.flight.isMock) ? (
        <p className="mock-banner" role="note">
          <strong>항공 MOCK</strong> · Amadeus 키가 없거나 API 실패 시 MockFlightProvider를 사용해요.
          확정 구매가가 아닙니다.
        </p>
      ) : null}
      {flexible ? (
        <p className="status-note flexible-note" role="status">
          유연 일정 모드 · 항공은 <strong>예상가(indicative)</strong>로 표시돼요.
        </p>
      ) : null}

      <div className="sort-row" role="group" aria-label="정렬">
        {SORT_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            className={`sort-chip${sort === option.id ? ' is-selected' : ''}`}
            aria-pressed={sort === option.id}
            onClick={() => onSortChange(option.id)}
            disabled={loading}
          >
            {option.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="state-panel" role="status" aria-live="polite">
          <p className="state-title">목업 추천을 준비하고 있어요</p>
          <p className="helper-text">항공·숙소 예시 견적을 불러오는 중이에요.</p>
        </div>
      ) : null}

      {!loading && error ? (
        <div className="state-panel" role="alert">
          <p className="state-title">추천을 불러오지 못했어요</p>
          <p className="helper-text">{error}</p>
          <button type="button" className="secondary-cta" onClick={onRetry}>
            다시 시도
          </button>
        </div>
      ) : null}

      {!loading && !error && items.length === 0 ? (
        <div className="state-panel" role="status">
          <p className="state-title">조건에 맞는 여행지가 없어요</p>
          <p className="helper-text">예산을 조금 올리거나 기간을 조정해 보세요.</p>
          <button type="button" className="secondary-cta" onClick={onBack}>
            조건으로 돌아가기
          </button>
        </div>
      ) : null}

      {!loading && !error && items.length > 0 ? (
        <div className="destination-card-list">
          {items.map((item) => (
            <DestinationCard key={item.destination.id} item={item} onSelect={onSelect} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
