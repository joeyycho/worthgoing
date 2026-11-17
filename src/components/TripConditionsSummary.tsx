import { formatKrw } from '../constants/travelSearch';
import type { TravelSearchFormState } from '../types/travelSearch';

interface TripConditionsSummaryProps {
  form: TravelSearchFormState;
}

export function TripConditionsSummary({ form }: TripConditionsSummaryProps) {
  const totalBudget = form.budgetPerPerson * form.travelers;
  const flexible = form.departureDate === '' && form.returnDate === '';

  return (
    <section className="detail-block conditions-summary">
      <h2 className="section-title">저장된 검색 조건</h2>
      <dl className="conditions-grid">
        <div>
          <dt>총 예산</dt>
          <dd>{formatKrw(totalBudget)}원</dd>
        </div>
        <div>
          <dt>1인당</dt>
          <dd>{formatKrw(form.budgetPerPerson)}원</dd>
        </div>
        <div>
          <dt>인원</dt>
          <dd>{form.travelers}명</dd>
        </div>
        <div>
          <dt>기간</dt>
          <dd>{form.tripLengthDays}일</dd>
        </div>
        <div>
          <dt>출발 공항</dt>
          <dd>{form.departureAirports.join(', ')}</dd>
        </div>
        <div>
          <dt>일정</dt>
          <dd>
            {flexible
              ? '유연 일정'
              : `${form.departureDate || '—'} ~ ${form.returnDate || '—'}`}
          </dd>
        </div>
      </dl>
    </section>
  );
}
