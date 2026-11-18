import type { AccommodationQuote, FlightQuote } from './providers';
import type { TravelSearchFormState } from './travelSearch';

/**
 * Budget fit against estimated trip totals (search + catalog local).
 * Legacy `within_budget` / `over_budget` kept for saved/shared snapshot compat.
 * New recommend rows use `*_estimate` so UI never reads as confirmed booking fit.
 */
export type BudgetFitStatus =
  | 'within_budget_estimate'
  | 'over_budget_estimate'
  | 'price_unknown'
  | 'local_spend_unknown'
  | 'within_budget'
  | 'over_budget';

export type RecommendationSort = 'lowest_cost' | 'recommended';

/** Catalog baseline: per-person daily local spend (no transport — unimplemented). */
export interface LocalDailyPerPerson {
  activityKrw: number;
  foodKrw: number;
  shoppingKrw: number;
}

/** Trip-level local spend estimate derived from catalog daily × days × travelers. */
export interface LocalSpendEstimate {
  activityKrw: number;
  foodKrw: number;
  shoppingKrw: number;
  /**
   * Only set when a real transport figure exists.
   * Unimplemented destinations omit this field — never invent 0.
   */
  transportKrw?: number;
}

export type LocalSpendSource = 'catalog_daily_estimate';

export type LocalSpendConfidence = 'low' | 'medium' | 'high';

export interface LocalSpendMeta {
  source: LocalSpendSource;
  confidence: LocalSpendConfidence;
  isEstimated: true;
}

/** Live / provider search costs (air + stay). */
export interface SearchCostTotals {
  flightTotalKrw: number | null;
  stayTotalKrw: number | null;
  /** Set only when both flight and stay quotes are present. */
  searchCostTotalKrw: number | null;
}

export interface MockDestination {
  id: string;
  city: string;
  country: string;
  countryCode: string;
  airportCode: string;
  intro: string;
  photoUrl: string;
  photoAlt: string;
  attractions: string[];
  food: string[];
  activities: string[];
  shopping: string[];
  sampleItinerary: { day: number; title: string; detail: string }[];
  /**
   * Per-person daily local spend baselines used to build estimates.
   * Omit when catalog has no local-spend data — recommend must not invent fit.
   */
  localDailyPerPerson?: LocalDailyPerPerson;
  /** Relative mock flight/lodging price factors (1 = baseline) */
  priceFactor: number;
  /** When true, mock providers intentionally omit confirmed prices */
  forcePriceUnknown?: boolean;
}

export interface CostBreakdown {
  flightKrw: number | null;
  lodgingKrw: number | null;
  activityKrw: number | null;
  foodKrw: number | null;
  shoppingKrw: number | null;
  /** Present only when transport data exists; omit/null means unimplemented. */
  transportKrw?: number | null;
}

export interface DestinationRecommendation {
  destination: MockDestination;
  flight: FlightQuote;
  lodging: AccommodationQuote;
  searchCost: SearchCostTotals;
  localSpend: LocalSpendEstimate | null;
  localSpendMeta: LocalSpendMeta | null;
  localSpendTotalKrw: number | null;
  breakdown: CostBreakdown;
  /**
   * Trip estimate = searchCostTotal + localSpendTotal when both fully present.
   * Labeled as estimate in UI — not a confirmed booking total.
   */
  estimatedTripTotalKrw: number | null;
  /**
   * Compat alias of `estimatedTripTotalKrw` for saved trips / older UI paths.
   * null when any required part (live search pair or local) is missing.
   */
  estimatedTotalKrw: number | null;
  totalBudgetKrw: number;
  remainingKrw: number | null;
  remainingPercent: number | null;
  status: BudgetFitStatus;
  /** True when flight and/or lodging quotes include mock data */
  isMock: boolean;
}

export interface RecommendRequest {
  form: TravelSearchFormState;
  sort: RecommendationSort;
}

export type SearchFlowView = 'form' | 'results' | 'detail';
