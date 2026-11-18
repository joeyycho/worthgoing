import { resolveHotelCityCode } from '../data/hotelCityCodes';
import { MOCK_DESTINATIONS } from '../data/mockDestinations';
import { ApiAccommodationProvider } from '../providers/ApiAccommodationProvider';
import { ApiFlightProvider } from '../providers/ApiFlightProvider';
import { MockAccommodationProvider } from '../providers/MockAccommodationProvider';
import { MockFlightProvider } from '../providers/MockFlightProvider';
import type {
  BudgetFitStatus,
  DestinationRecommendation,
  LocalDailyPerPerson,
  LocalSpendEstimate,
  LocalSpendMeta,
  RecommendationSort,
  SearchCostTotals,
} from '../types/recommendation';
import type { AccommodationQuote, FlightQuote } from '../types/providers';
import type { TravelSearchFormState } from '../types/travelSearch';
import { isApiConfigured } from './api/tripApiClient';

const LOCAL_SPEND_META: LocalSpendMeta = {
  source: 'catalog_daily_estimate',
  confidence: 'low',
  isEstimated: true,
};

function buildMockFlightProvider() {
  const priceFactorByDestination = Object.fromEntries(
    MOCK_DESTINATIONS.map((item) => [item.id, item.priceFactor]),
  );
  const forceUnknownIds = new Set(
    MOCK_DESTINATIONS.filter((item) => item.forcePriceUnknown).map((item) => item.id),
  );
  return new MockFlightProvider({ priceFactorByDestination, forceUnknownIds });
}

function buildMockStayProvider() {
  const priceFactorByDestination = Object.fromEntries(
    MOCK_DESTINATIONS.map((item) => [item.id, item.priceFactor]),
  );
  const forceUnknownIds = new Set(
    MOCK_DESTINATIONS.filter((item) => item.forcePriceUnknown).map((item) => item.id),
  );
  return new MockAccommodationProvider({ priceFactorByDestination, forceUnknownIds });
}

/**
 * Local spend uses `tripLengthDays` (calendar days, e.g. 4박5일 → 5).
 * Hotel nights use `tripLengthDays - 1` separately — do not mix the two.
 * Transport is intentionally omitted (unimplemented — never invent 0).
 */
export function estimateLocalSpend(
  daily: LocalDailyPerPerson,
  travelers: number,
  tripLengthDays: number,
): LocalSpendEstimate {
  const days = Math.max(1, tripLengthDays);
  return {
    activityKrw: daily.activityKrw * days * travelers,
    foodKrw: daily.foodKrw * days * travelers,
    shoppingKrw: daily.shoppingKrw * days * travelers,
  };
}

export function sumLocalSpend(local: LocalSpendEstimate): number {
  return (
    local.activityKrw +
    local.foodKrw +
    local.shoppingKrw +
    (local.transportKrw ?? 0)
  );
}

export function buildSearchCostTotals(
  flightTotalKrw: number | null,
  stayTotalKrw: number | null,
): SearchCostTotals {
  const searchCostTotalKrw =
    flightTotalKrw != null && stayTotalKrw != null ? flightTotalKrw + stayTotalKrw : null;
  return { flightTotalKrw, stayTotalKrw, searchCostTotalKrw };
}

/**
 * Status rules:
 * - missing live flight or stay → price_unknown (never claim within on search-only)
 * - live pair present but local catalog missing → local_spend_unknown (no invented fit)
 * - both present → within/over_budget_estimate (estimate wording; not confirmed booking)
 */
export function resolveBudgetFitStatus(input: {
  searchCostTotalKrw: number | null;
  localSpendTotalKrw: number | null;
  estimatedTripTotalKrw: number | null;
  totalBudgetKrw: number;
}): BudgetFitStatus {
  if (input.searchCostTotalKrw == null) {
    return 'price_unknown';
  }
  if (input.localSpendTotalKrw == null || input.estimatedTripTotalKrw == null) {
    return 'local_spend_unknown';
  }
  return input.estimatedTripTotalKrw <= input.totalBudgetKrw
    ? 'within_budget_estimate'
    : 'over_budget_estimate';
}

function sortRank(status: BudgetFitStatus): number {
  switch (status) {
    case 'within_budget_estimate':
    case 'within_budget':
      return 0;
    case 'local_spend_unknown':
      return 1;
    case 'price_unknown':
      return 2;
    case 'over_budget_estimate':
    case 'over_budget':
      return 3;
    default:
      return 2;
  }
}

function sortRecommendations(
  items: DestinationRecommendation[],
  sort: RecommendationSort,
): DestinationRecommendation[] {
  const copy = [...items];

  if (sort === 'lowest_cost') {
    return copy.sort((a, b) => {
      const aCost = a.estimatedTripTotalKrw ?? a.searchCost.searchCostTotalKrw;
      const bCost = b.estimatedTripTotalKrw ?? b.searchCost.searchCostTotalKrw;
      if (aCost == null && bCost == null) {
        return a.destination.city.localeCompare(b.destination.city, 'ko');
      }
      if (aCost == null) return 1;
      if (bCost == null) return -1;
      return aCost - bCost;
    });
  }

  return copy.sort((a, b) => {
    const statusDiff = sortRank(a.status) - sortRank(b.status);
    if (statusDiff !== 0) return statusDiff;

    const aRemain = a.remainingPercent ?? -999;
    const bRemain = b.remainingPercent ?? -999;
    if (bRemain !== aRemain) return bRemain - aRemain;

    const aCost =
      a.estimatedTripTotalKrw ?? a.searchCost.searchCostTotalKrw ?? Number.MAX_SAFE_INTEGER;
    const bCost =
      b.estimatedTripTotalKrw ?? b.searchCost.searchCostTotalKrw ?? Number.MAX_SAFE_INTEGER;
    return aCost - bCost;
  });
}

async function loadFlightQuotes(form: TravelSearchFormState): Promise<Map<string, FlightQuote>> {
  const mock = buildMockFlightProvider();
  const destinations = MOCK_DESTINATIONS.map((item) => ({
    id: item.id,
    airportCode: item.airportCode,
  }));

  if (isApiConfigured()) {
    try {
      const api = new ApiFlightProvider();
      return await api.searchBatch(
        {
          originAirports: form.departureAirports,
          travelers: form.travelers,
          tripLengthDays: form.tripLengthDays,
          departureDate: form.departureDate,
          returnDate: form.returnDate,
        },
        destinations,
      );
    } catch (error) {
      console.warn('Flight API unavailable; using MockFlightProvider', error);
    }
  }

  const entries = await Promise.all(
    MOCK_DESTINATIONS.map(async (destination) => {
      const quote = await mock.searchFlights({
        originAirports: form.departureAirports,
        destinationAirport: destination.airportCode,
        travelers: form.travelers,
        tripLengthDays: form.tripLengthDays,
        departureDate: form.departureDate,
        returnDate: form.returnDate,
        destinationId: destination.id,
      });
      return [destination.id, quote] as const;
    }),
  );
  return new Map(entries);
}

async function loadStayQuotes(
  form: TravelSearchFormState,
  nights: number,
): Promise<Map<string, AccommodationQuote>> {
  const mock = buildMockStayProvider();
  const rooms = Math.max(1, Math.ceil(form.travelers / 2));
  const destinations = MOCK_DESTINATIONS.map((item) => ({
    id: item.id,
    city: item.city,
    country: item.country,
    cityCode: resolveHotelCityCode(item),
    airportCode: item.airportCode,
  }));

  if (isApiConfigured()) {
    try {
      const api = new ApiAccommodationProvider();
      return await api.searchBatch(
        {
          travelers: form.travelers,
          nights,
          rooms,
          checkInDate: form.departureDate,
          checkOutDate: form.returnDate,
        },
        destinations,
      );
    } catch (error) {
      console.warn('Accommodation API unavailable; using MockAccommodationProvider', error);
    }
  }

  const entries = await Promise.all(
    MOCK_DESTINATIONS.map(async (destination) => {
      const quote = await mock.searchAccommodations({
        city: destination.city,
        country: destination.country,
        travelers: form.travelers,
        nights,
        rooms,
        checkInDate: form.departureDate,
        checkOutDate: form.returnDate,
        cityCode: resolveHotelCityCode(destination),
        airportCode: destination.airportCode,
        destinationId: destination.id,
      });
      return [destination.id, quote] as const;
    }),
  );
  return new Map(entries);
}

export async function recommendDestinations(
  form: TravelSearchFormState,
  sort: RecommendationSort = 'lowest_cost',
): Promise<DestinationRecommendation[]> {
  const totalBudgetKrw = form.budgetPerPerson * form.travelers;
  /** Hotel nights for 4박5일: tripLengthDays 5 → 4 nights. */
  const nights = Math.max(1, form.tripLengthDays - 1);
  const [flightMap, stayMap] = await Promise.all([
    loadFlightQuotes(form),
    loadStayQuotes(form, nights),
  ]);

  const rows = await Promise.all(
    MOCK_DESTINATIONS.map(async (destination) => {
      const flight =
        flightMap.get(destination.id) ??
        (await buildMockFlightProvider().searchFlights({
          originAirports: form.departureAirports,
          destinationAirport: destination.airportCode,
          travelers: form.travelers,
          tripLengthDays: form.tripLengthDays,
          departureDate: form.departureDate,
          returnDate: form.returnDate,
          destinationId: destination.id,
        }));

      const lodging =
        stayMap.get(destination.id) ??
        (await buildMockStayProvider().searchAccommodations({
          city: destination.city,
          country: destination.country,
          travelers: form.travelers,
          nights,
          rooms: Math.max(1, Math.ceil(form.travelers / 2)),
          checkInDate: form.departureDate,
          checkOutDate: form.returnDate,
          cityCode: resolveHotelCityCode(destination),
          airportCode: destination.airportCode,
          destinationId: destination.id,
        }));

      const searchCost = buildSearchCostTotals(flight.totalFareKrw, lodging.totalStayKrw);

      const dailyLocal = destination.localDailyPerPerson;
      const localSpend =
        dailyLocal != null
          ? estimateLocalSpend(dailyLocal, form.travelers, form.tripLengthDays)
          : null;
      const localSpendMeta = localSpend != null ? LOCAL_SPEND_META : null;
      const localSpendTotalKrw = localSpend != null ? sumLocalSpend(localSpend) : null;

      const estimatedTripTotalKrw =
        searchCost.searchCostTotalKrw != null && localSpendTotalKrw != null
          ? searchCost.searchCostTotalKrw + localSpendTotalKrw
          : null;

      const remainingKrw =
        estimatedTripTotalKrw == null ? null : totalBudgetKrw - estimatedTripTotalKrw;
      const remainingPercent =
        remainingKrw == null ? null : Math.round((remainingKrw / totalBudgetKrw) * 1000) / 10;

      const status = resolveBudgetFitStatus({
        searchCostTotalKrw: searchCost.searchCostTotalKrw,
        localSpendTotalKrw,
        estimatedTripTotalKrw,
        totalBudgetKrw,
      });

      const recommendation: DestinationRecommendation = {
        destination,
        flight,
        lodging,
        searchCost,
        localSpend,
        localSpendMeta,
        localSpendTotalKrw,
        breakdown: {
          flightKrw: searchCost.flightTotalKrw,
          lodgingKrw: searchCost.stayTotalKrw,
          activityKrw: localSpend?.activityKrw ?? null,
          foodKrw: localSpend?.foodKrw ?? null,
          shoppingKrw: localSpend?.shoppingKrw ?? null,
          // transport omitted when unimplemented — never force 0
          ...(localSpend?.transportKrw != null ? { transportKrw: localSpend.transportKrw } : {}),
        },
        estimatedTripTotalKrw,
        estimatedTotalKrw: estimatedTripTotalKrw,
        totalBudgetKrw,
        remainingKrw,
        remainingPercent,
        status,
        isMock: flight.isMock || lodging.isMock,
      };

      return recommendation;
    }),
  );

  return sortRecommendations(rows, sort);
}
