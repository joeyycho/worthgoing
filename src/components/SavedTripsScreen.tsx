import { useCallback, useEffect, useState } from 'react';
import { BUDGET_STATUS_LABEL } from '../constants/recommendation';
import { formatKrw } from '../constants/travelSearch';
import { useNestedBackNavigation } from '../hooks/useNestedBackNavigation';
import { listSavedTrips, removeSavedTrip } from '../services/savedTripsStore';
import { formatCapturedAt } from '../services/tripSnapshot';
import type { SavedTrip } from '../types/tripStore';
import { DestinationDetailScreen } from './DestinationDetailScreen';

export function SavedTripsScreen() {
  const [trips, setTrips] = useState<SavedTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setTrips(await listSavedTrips());
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장 목록을 불러오지 못했어요.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selected = trips.find((trip) => trip.id === selectedId) ?? null;

  const handleBack = useCallback(() => {
    setSelectedId(null);
  }, []);

  useNestedBackNavigation(Boolean(selected), handleBack);

  if (selected) {
    return (
      <DestinationDetailScreen
        mode="saved"
        item={selected.snapshot.recommendation}
        form={selected.snapshot.form}
        capturedAt={selected.snapshot.capturedAt}
        onBack={handleBack}
        onDeleteSaved={() => {
          void (async () => {
            await removeSavedTrip(selected.id);
            setSelectedId(null);
            await refresh();
          })();
        }}
      />
    );
  }

  return (
    <section className="saved-screen">
      <header className="results-header">
        <h1 className="page-title">저장한 여행</h1>
        <p className="page-subtitle">저장 시점의 조건·MOCK 가격을 다시 볼 수 있어요.</p>
      </header>

      <p className="mock-banner" role="note">
        <strong>클라이언트 저장</strong> · Apps in Toss Storage / localStorage. 서버 동기화는 stage 5.
      </p>

      {loading ? (
        <div className="state-panel" role="status">
          <p className="state-title">불러오는 중…</p>
        </div>
      ) : null}

      {!loading && error ? (
        <div className="state-panel" role="alert">
          <p className="state-title">오류</p>
          <p className="helper-text">{error}</p>
          <button type="button" className="secondary-cta" onClick={() => void refresh()}>
            다시 시도
          </button>
        </div>
      ) : null}

      {!loading && !error && trips.length === 0 ? (
        <div className="state-panel" role="status">
          <p className="state-title">아직 저장한 여행이 없어요</p>
          <p className="helper-text">추천 상세에서 “이 결과 저장”을 눌러 보세요.</p>
        </div>
      ) : null}

      {!loading && !error && trips.length > 0 ? (
        <ul className="saved-list">
          {trips.map((trip) => {
            const { recommendation, form, capturedAt } = trip.snapshot;
            const total = recommendation.estimatedTotalKrw;
            return (
              <li key={trip.id}>
                <button
                  type="button"
                  className="saved-card"
                  onClick={() => setSelectedId(trip.id)}
                >
                  <img
                    src={recommendation.destination.photoUrl}
                    alt={recommendation.destination.photoAlt}
                  />
                  <div className="saved-card-body">
                    <div className="destination-card-top">
                      <div>
                        <p className="destination-card-country">
                          {recommendation.destination.country} · {recommendation.destination.city}
                        </p>
                        <h2 className="destination-card-title">{recommendation.destination.city}</h2>
                      </div>
                      <span className={`budget-badge status-${recommendation.status}`}>
                        {BUDGET_STATUS_LABEL[recommendation.status]}
                      </span>
                    </div>
                    <p className="destination-card-total">
                      {total == null ? '가격 확인 필요' : `${formatKrw(total)}원`}
                    </p>
                    <p className="helper-text">
                      예산 {formatKrw(form.budgetPerPerson * form.travelers)}원 · {form.travelers}명 ·{' '}
                      {form.tripLengthDays}일
                    </p>
                    <p className="helper-text">저장 시각 {formatCapturedAt(capturedAt)}</p>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
