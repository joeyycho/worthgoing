import { BUDGET_STATUS_LABEL } from '../constants/recommendation';
import { formatKrw } from '../constants/travelSearch';
import type { DestinationRecommendation } from '../types/recommendation';

interface DestinationCardProps {
  item: DestinationRecommendation;
  onSelect: (id: string) => void;
}

export function DestinationCard({ item, onSelect }: DestinationCardProps) {
  const { destination, status, estimatedTotalKrw, remainingPercent, flight, lodging } = item;

  return (
    <button
      type="button"
      className={`destination-card status-${status}`}
      onClick={() => onSelect(destination.id)}
    >
      <img className="destination-card-photo" src={destination.photoUrl} alt={destination.photoAlt} />
      <div className="destination-card-body">
        <div className="destination-card-top">
          <div>
            <p className="destination-card-country">
              {destination.country} · {destination.city}
            </p>
            <h3 className="destination-card-title">{destination.city}</h3>
          </div>
          <span className={`budget-badge status-${status}`}>{BUDGET_STATUS_LABEL[status]}</span>
        </div>

        {status === 'price_unknown' || estimatedTotalKrw == null ? (
          <p className="destination-card-total muted">총비용 미확정 · 가격 확인 필요</p>
        ) : (
          <p className="destination-card-total">{formatKrw(estimatedTotalKrw)}원</p>
        )}

        <dl className="destination-card-meta">
          <div>
            <dt>항공</dt>
            <dd>{flight.totalFareKrw == null ? '확인 필요' : `${formatKrw(flight.totalFareKrw)}원`}</dd>
          </div>
          <div>
            <dt>숙소</dt>
            <dd>
              {lodging.totalStayKrw == null ? '확인 필요' : `${formatKrw(lodging.totalStayKrw)}원`}
            </dd>
          </div>
          <div>
            <dt>잔여</dt>
            <dd>
              {remainingPercent == null
                ? '—'
                : remainingPercent >= 0
                  ? `${remainingPercent}%`
                  : `${remainingPercent}% 초과`}
            </dd>
          </div>
        </dl>
      </div>
    </button>
  );
}
