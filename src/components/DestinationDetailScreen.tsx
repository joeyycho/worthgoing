import { BUDGET_STATUS_LABEL } from '../constants/recommendation';
import { formatKrw } from '../constants/travelSearch';
import type { DestinationRecommendation } from '../types/recommendation';
import { CostBreakdownChart } from './CostBreakdownChart';
import { MockBanner } from './MockBanner';

interface DestinationDetailScreenProps {
  item: DestinationRecommendation;
  onBack: () => void;
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

export function DestinationDetailScreen({ item, onBack }: DestinationDetailScreenProps) {
  const { destination, flight, lodging, status, estimatedTotalKrw, remainingKrw, remainingPercent } =
    item;

  return (
    <article className="detail-screen">
      <button type="button" className="text-back" onClick={onBack}>
        ← 목록으로
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

      <section className="detail-block">
        <h2 className="section-title">항공 (MOCK)</h2>
        <p className="detail-strong">
          {flight.totalFareKrw == null ? '요금 확인 필요' : `${formatKrw(flight.totalFareKrw)}원`}
        </p>
        <p className="helper-text">
          {flight.carrier} · {flight.summary}
        </p>
        <a className="external-link" href={flight.bookingUrl} target="_blank" rel="noopener noreferrer">
          목업 예약 링크 열기
        </a>
      </section>

      <section className="detail-block">
        <h2 className="section-title">숙소 (MOCK)</h2>
        <p className="detail-strong">
          {lodging.totalStayKrw == null ? '요금 확인 필요' : `${formatKrw(lodging.totalStayKrw)}원`}
        </p>
        <p className="helper-text">
          {lodging.propertyName} · {lodging.summary}
        </p>
        <a
          className="external-link"
          href={lodging.bookingUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          목업 예약 링크 열기
        </a>
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
