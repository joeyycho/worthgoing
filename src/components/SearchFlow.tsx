import { useCallback, useState } from 'react';
import { useNestedBackNavigation } from '../hooks/useNestedBackNavigation';
import { recommendDestinations } from '../services/recommendDestinations';
import type {
  DestinationRecommendation,
  RecommendationSort,
  SearchFlowView,
} from '../types/recommendation';
import type { TravelSearchFormState } from '../types/travelSearch';
import { DestinationDetailScreen } from './DestinationDetailScreen';
import { RecommendationListScreen } from './RecommendationListScreen';
import { TravelSearchScreen } from './TravelSearchScreen';

export function SearchFlow() {
  const [view, setView] = useState<SearchFlowView>('form');
  const [form, setForm] = useState<TravelSearchFormState | null>(null);
  const [sort, setSort] = useState<RecommendationSort>('lowest_cost');
  const [items, setItems] = useState<DestinationRecommendation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = items.find((item) => item.destination.id === selectedId) ?? null;

  const loadRecommendations = useCallback(
    async (nextForm: TravelSearchFormState, nextSort: RecommendationSort) => {
      setLoading(true);
      setError(null);
      try {
        const results = await recommendDestinations(nextForm, nextSort);
        setItems(results);
      } catch (err) {
        setItems([]);
        setError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했어요.');
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const handleSearch = useCallback(
    (nextForm: TravelSearchFormState) => {
      setForm(nextForm);
      setSort('lowest_cost');
      setSelectedId(null);
      setView('results');
      void loadRecommendations(nextForm, 'lowest_cost');
    },
    [loadRecommendations],
  );

  const handleSortChange = useCallback(
    (nextSort: RecommendationSort) => {
      setSort(nextSort);
      if (!form) {
        return;
      }
      void loadRecommendations(form, nextSort);
    },
    [form, loadRecommendations],
  );

  const handleRetry = useCallback(() => {
    if (!form) {
      return;
    }
    void loadRecommendations(form, sort);
  }, [form, sort, loadRecommendations]);

  const handleBack = useCallback(() => {
    if (view === 'detail') {
      setSelectedId(null);
      setView('results');
      return;
    }
    if (view === 'results') {
      setView('form');
    }
  }, [view]);

  useNestedBackNavigation(view !== 'form', handleBack);

  if (view === 'detail' && selected) {
    return <DestinationDetailScreen item={selected} onBack={handleBack} />;
  }

  if (view === 'results' && form) {
    return (
      <RecommendationListScreen
        form={form}
        items={items}
        sort={sort}
        loading={loading}
        error={error}
        onSortChange={handleSortChange}
        onSelect={(id) => {
          setSelectedId(id);
          setView('detail');
        }}
        onBack={handleBack}
        onRetry={handleRetry}
      />
    );
  }

  return <TravelSearchScreen initialForm={form ?? undefined} onSearch={handleSearch} />;
}
