import type { BudgetFitStatus, RecommendationSort } from '../types/recommendation';

export const BUDGET_STATUS_LABEL: Record<BudgetFitStatus, string> = {
  within_budget: '예산 적합',
  over_budget: '예산 초과',
  price_unknown: '가격 확인 필요',
};

export const SORT_OPTIONS: { id: RecommendationSort; label: string }[] = [
  { id: 'lowest_cost', label: '낮은 비용순' },
  { id: 'recommended', label: '추천순' },
];
