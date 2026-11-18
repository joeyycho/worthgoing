import { resolveHotelCityCode } from '../data/hotelCityCodes';
import { MOCK_DESTINATIONS } from '../data/mockDestinations';
import { ApiAccommodationProvider } from '../providers/ApiAccommodationProvider';
import { ApiFlightProvider } from '../providers/ApiFlightProvider';
import { MockAccommodationProvider } from '../providers/MockAccommodationProvider';
import { MockFlightProvider } from '../providers/MockFlightProvider';
import type {
  BudgetFitStatus,
  DestinationRecommendation,
  LocalSpendEstimate,
  RecommendationSort,
} from '../types/recommendation';
import type { AccommodationQuote, FlightQuote } from '../types/providers';
import type { TravelSearchFormState } from '../types/travelSearch';
import { isApiConfigured } from './api/tripApiClient';

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

function estimateLocalSpend(
  daily: LocalSpendEstimate,
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

function resolveStatus(
  estimatedTotalKrw: number | null,
  totalBudgetKrw: number,
): BudgetFitStatus {
  if (estimatedTotalKrw == null) {
    return 'price_unknown';
  }
  return estimatedTotalKrw <= totalBudgetKrw ? 'within_budget' : 'over_budget';
}

function sortRecommendations(
  items: DestinationRecommendation[],
  sort: RecommendationSort,
): DestinationRecommendation[] {
  const copy = [...items];

  if (sort === 'lowest_cost') {
    return copy.sort((a, b) => {
      if (a.estimatedTotalKrw == null && b.estimatedTotalKrw == null) {
        return a.destination.city.localeCompare(b.destination.city, 'ko');
      }
      if (a.estimatedTotalKrw == null) return 1;
      if (b.estimatedTotalKrw == null) return -1;
      return a.estimatedTotalKrw - b.estimatedTotalKrw;
    });
  }

  const rank: Record<BudgetFitStatus, number> = {
    within_budget: 0,
    price_unknown: 1,
    over_budget: 2,
  };

  return copy.sort((a, b) => {
    const statusDiff = rank[a.status] - rank[b.status];
    if (statusDiff !== 0) return statusDiff;

    const aRemain = a.remainingPercent ?? -999;
    const bRemain = b.remainingPercent ?? -999;
    if (bRemain !== aRemain) return bRemain - aRemain;

    const aCost = a.estimatedTotalKrw ?? Number.MAX_SAFE_INTEGER;
    const bCost = b.estimatedTotalKrw ?? Number.MAX_SAFE_INTEGER;
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

      const localSpend = estimateLocalSpend(
        destination.localDailyPerPerson,
        form.travelers,
        form.tripLengthDays,
      );

      const localTotal = localSpend.activityKrw + localSpend.foodKrw + localSpend.shoppingKrw;
      const hasConfirmedQuotes = flight.totalFareKrw != null && lodging.totalStayKrw != null;
      const estimatedTotalKrw = hasConfirmedQuotes
        ? (flight.totalFareKrw as number) + (lodging.totalStayKrw as number) + localTotal
        : null;

      const remainingKrw =
        estimatedTotalKrw == null ? null : totalBudgetKrw - estimatedTotalKrw;
      const remainingPercent =
        remainingKrw == null ? null : Math.round((remainingKrw / totalBudgetKrw) * 1000) / 10;

      const recommendation: DestinationRecommendation = {
        destination,
        flight,
        lodging,
        localSpend,
        breakdown: {
          flightKrw: flight.totalFareKrw,
          lodgingKrw: lodging.totalStayKrw,
          activityKrw: localSpend.activityKrw,
          foodKrw: localSpend.foodKrw,
          shoppingKrw: localSpend.shoppingKrw,
        },
        estimatedTotalKrw,
        totalBudgetKrw,
        remainingKrw,
        remainingPercent,
        status: resolveStatus(estimatedTotalKrw, totalBudgetKrw),
        isMock: flight.isMock || lodging.isMock,
      };

      return recommendation;
    }),
  );

  return sortRecommendations(rows, sort);
}
