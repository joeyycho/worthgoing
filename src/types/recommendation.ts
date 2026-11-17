import type { AccommodationQuote, FlightQuote } from './providers';
import type { TravelSearchFormState } from './travelSearch';

export type BudgetFitStatus = 'within_budget' | 'over_budget' | 'price_unknown';

export type RecommendationSort = 'lowest_cost' | 'recommended';

export interface LocalSpendEstimate {
  activityKrw: number;
  foodKrw: number;
  shoppingKrw: number;
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
  /** Per-person daily local spend baselines used to build estimates */
  localDailyPerPerson: LocalSpendEstimate;
  /** Relative mock flight/lodging price factors (1 = baseline) */
  priceFactor: number;
  /** When true, mock providers intentionally omit confirmed prices */
  forcePriceUnknown?: boolean;
}

export interface CostBreakdown {
  flightKrw: number | null;
  lodgingKrw: number | null;
  activityKrw: number;
  foodKrw: number;
  shoppingKrw: number;
}

export interface DestinationRecommendation {
  destination: MockDestination;
  flight: FlightQuote;
  lodging: AccommodationQuote;
  localSpend: LocalSpendEstimate;
  breakdown: CostBreakdown;
  /** null when any major quote is missing */
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
