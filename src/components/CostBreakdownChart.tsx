import { formatKrw } from '../constants/travelSearch';
import type { CostBreakdown } from '../types/recommendation';

interface CostBreakdownChartProps {
  breakdown: CostBreakdown;
}

const ROWS: { key: keyof CostBreakdown; label: string; color: string }[] = [
  { key: 'flightKrw', label: '항공', color: '#3182f6' },
  { key: 'lodgingKrw', label: '숙소', color: '#15c47e' },
  { key: 'activityKrw', label: '액티비티', color: '#f59e0b' },
  { key: 'foodKrw', label: '식비', color: '#f04452' },
  { key: 'shoppingKrw', label: '쇼핑', color: '#8b5cf6' },
];

export function CostBreakdownChart({ breakdown }: CostBreakdownChartProps) {
  const amounts = ROWS.map((row) => ({
    ...row,
    amount: breakdown[row.key],
  }));

  const knownTotal = amounts.reduce((sum, row) => sum + (row.amount ?? 0), 0);
  const hasUnknown = amounts.some((row) => row.amount == null);

  return (
    <section className="cost-chart" aria-labelledby="cost-chart-title">
      <div className="section-heading-row">
        <h2 id="cost-chart-title" className="section-title">
          예상 경비 예시
        </h2>
        <span className="chip-muted">MOCK 비율</span>
      </div>
      <p className="helper-text">
        실제 여행자 통계가 아니며, 목업 데이터로 만든 예시 배분이에요.
      </p>

      <div className="cost-chart-bars" role="list">
        {amounts.map((row) => {
          const ratio =
            row.amount == null || knownTotal === 0 ? 0 : Math.round((row.amount / knownTotal) * 1000) / 10;
          return (
            <div key={row.key} className="cost-chart-row" role="listitem">
              <div className="cost-chart-label-row">
                <span>{row.label}</span>
                <span>
                  {row.amount == null ? '가격 확인 필요' : `${formatKrw(row.amount)}원 · ${ratio}%`}
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

      {hasUnknown ? (
        <p className="status-note" role="status">
          항공 또는 숙소 요금이 비어 있어 일부 항목은 확정 금액으로 표시하지 않아요.
        </p>
      ) : null}
    </section>
  );
}
