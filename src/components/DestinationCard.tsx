import { BUDGET_STATUS_LABEL } from '../constants/recommendation';
import { formatKrw } from '../constants/travelSearch';
import type { DestinationRecommendation } from '../types/recommendation';
import { flightFareAmountLabel } from '../utils/flightFareDisplay';

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

        <p
          className="flight-mode-chip"
          data-mode={flight.isMock ? 'mock' : flight.totalFareKrw == null ? 'unknown' : flight.priceMode}
        >
          {flight.isMock
            ? '항공 예시'
            : flight.totalFareKrw == null
              ? '항공 확인불가'
              : flight.priceMode === 'indicative'
                ? '항공 예상'
                : `항공 실시간 · ${new Date(flight.searchedAt).toLocaleString('ko-KR')}`}
        </p>
        <p
          className="flight-mode-chip"
          data-mode={
            lodging.isMock ? 'mock' : lodging.totalStayKrw == null ? 'unknown' : lodging.priceMode
          }
        >
          {lodging.isMock
            ? '숙소 예시'
            : lodging.totalStayKrw == null
              ? '숙소 확인불가'
              : lodging.priceMode === 'indicative'
                ? '숙소 예상'
                : `숙소 실시간 · ${new Date(lodging.searchedAt).toLocaleString('ko-KR')}`}
        </p>

        <dl className="destination-card-meta">
          <div>
            <dt>항공</dt>
            <dd>{flightFareAmountLabel(flight.totalFareKrw)}</dd>
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
