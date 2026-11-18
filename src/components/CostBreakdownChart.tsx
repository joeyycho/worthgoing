import { formatKrw } from '../constants/travelSearch';
import type { CostBreakdown, LocalSpendMeta } from '../types/recommendation';

interface CostBreakdownChartProps {
  breakdown: CostBreakdown;
  localSpendMeta: LocalSpendMeta | null;
  searchCostTotalKrw: number | null;
  localSpendTotalKrw: number | null;
  estimatedTripTotalKrw: number | null;
}

const LIVE_ROWS: { key: 'flightKrw' | 'lodgingKrw'; label: string; color: string }[] = [
  { key: 'flightKrw', label: '항공 (검색)', color: '#3182f6' },
  { key: 'lodgingKrw', label: '숙소 (검색)', color: '#15c47e' },
];

const LOCAL_ROWS: { key: 'activityKrw' | 'foodKrw' | 'shoppingKrw'; label: string; color: string }[] =
  [
    { key: 'activityKrw', label: '액티비티 (예상)', color: '#f59e0b' },
    { key: 'foodKrw', label: '식비 (예상)', color: '#f04452' },
    { key: 'shoppingKrw', label: '쇼핑 (예상)', color: '#8b5cf6' },
  ];

function amountLabel(amount: number | null | undefined): string {
  if (amount == null) return '확인불가';
  return `${formatKrw(amount)}원`;
}

export function CostBreakdownChart({
  breakdown,
  localSpendMeta,
  searchCostTotalKrw,
  localSpendTotalKrw,
  estimatedTripTotalKrw,
}: CostBreakdownChartProps) {
  const liveAmounts = LIVE_ROWS.map((row) => ({
    ...row,
    amount: breakdown[row.key],
  }));
  const localAmounts = LOCAL_ROWS.map((row) => ({
    ...row,
    amount: breakdown[row.key],
  }));
  const hasLocal = localSpendMeta != null && localSpendTotalKrw != null;
  // Transport only when a real figure exists — never show unimplemented as 0
  const transportAmount = breakdown.transportKrw;
  const showTransport = transportAmount != null;

  const barBasis =
    estimatedTripTotalKrw ??
    (searchCostTotalKrw ?? 0) + (localSpendTotalKrw ?? 0);

  return (
    <section className="cost-chart" aria-labelledby="cost-chart-title">
      <div className="section-heading-row">
        <h2 id="cost-chart-title" className="section-title">
          경비 구성
        </h2>
        <span className="chip-muted">검색 + 현지 예상</span>
      </div>
      <p className="helper-text">
        항공·숙소는 검색 결과 가격이고, 현지비는 카탈로그 일일 단가 기반 예상이에요. 확정 예약
        총액이 아닙니다. 가격 출처는 각 항목 표기를 확인해 주세요.
      </p>

      <h3 className="cost-chart-subtitle">항공·숙소 검색</h3>
      <div className="cost-chart-bars" role="list">
        {liveAmounts.map((row) => {
          const ratio =
            row.amount == null || barBasis === 0
              ? 0
              : Math.round((row.amount / barBasis) * 1000) / 10;
          return (
            <div key={row.key} className="cost-chart-row" role="listitem">
              <div className="cost-chart-label-row">
                <span>{row.label}</span>
                <span>
                  {row.amount == null
                    ? '확인불가'
                    : `${formatKrw(row.amount)}원 · ${ratio}%`}
                </span>
              </div>
              <div className="cost-chart-track" aria-hidden="true">
                <div
                  className="cost-chart-fill"
                  style={{
                    width: `${Math.min(100, ratio)}%`,
                    background: row.color,
                    opacity: row.amount == null ? 0.25 : 1,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <p className="helper-text">
        검색 합계 {searchCostTotalKrw == null ? '확인불가' : `${formatKrw(searchCostTotalKrw)}원`}
        {searchCostTotalKrw == null ? ' (항공·숙소가 모두 있어야 합산)' : ''}
      </p>

      <h3 className="cost-chart-subtitle">현지 지출 예상</h3>
      {hasLocal ? (
        <>
          <p className="helper-text">
            출처 {localSpendMeta.source} · 신뢰도 {localSpendMeta.confidence} · 예상치
          </p>
          <div className="cost-chart-bars" role="list">
            {localAmounts.map((row) => {
              const ratio =
                row.amount == null || barBasis === 0
                  ? 0
                  : Math.round((row.amount / barBasis) * 1000) / 10;
              return (
                <div key={row.key} className="cost-chart-row" role="listitem">
                  <div className="cost-chart-label-row">
                    <span>{row.label}</span>
                    <span>
                      {row.amount == null
                        ? '미확정'
                        : `${formatKrw(row.amount)}원 · ${ratio}%`}
                    </span>
                  </div>
                  <div className="cost-chart-track" aria-hidden="true">
                    <div
                      className="cost-chart-fill"
                      style={{
                        width: `${Math.min(100, ratio)}%`,
                        background: row.color,
                        opacity: row.amount == null ? 0.25 : 1,
                      }}
                    />
                  </div>
                </div>
              );
            })}
            {showTransport ? (
              <div className="cost-chart-row" role="listitem">
                <div className="cost-chart-label-row">
                  <span>교통 (예상)</span>
                  <span>{amountLabel(transportAmount)}</span>
                </div>
              </div>
            ) : (
              <p className="helper-text">교통비는 아직 데이터가 없어 표시하지 않아요.</p>
            )}
          </div>
          <p className="helper-text">현지 예상 합계 {formatKrw(localSpendTotalKrw)}원</p>
        </>
      ) : (
        <p className="status-note" role="status">
          현지비 카탈로그가 없어 현지 지출을 추정하지 않아요. 예산 적합도도 확정하지 않습니다.
        </p>
      )}

      <p className="detail-strong">
        여행 예상 총액{' '}
        {estimatedTripTotalKrw == null
          ? '미확정'
          : `${formatKrw(estimatedTripTotalKrw)}원 (예상)`}
      </p>
    </section>
  );
}
