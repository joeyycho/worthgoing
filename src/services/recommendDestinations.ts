import { MOCK_DESTINATIONS } from '../data/mockDestinations';
import { MockAccommodationProvider } from '../providers/MockAccommodationProvider';
import { MockFlightProvider } from '../providers/MockFlightProvider';
import type {
  BudgetFitStatus,
  DestinationRecommendation,
  LocalSpendEstimate,
  RecommendationSort,
} from '../types/recommendation';
import type { TravelSearchFormState } from '../types/travelSearch';

function buildProviders() {
  const priceFactorByDestination = Object.fromEntries(
    MOCK_DESTINATIONS.map((item) => [item.id, item.priceFactor]),
  );
  const forceUnknownIds = new Set(
    MOCK_DESTINATIONS.filter((item) => item.forcePriceUnknown).map((item) => item.id),
  );

  return {
    flights: new MockFlightProvider({ priceFactorByDestination, forceUnknownIds }),
    stays: new MockAccommodationProvider({ priceFactorByDestination, forceUnknownIds }),
  };
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
      if (a.estimatedTotalKrw == null && b.estimatedTotalKrw == null) return a.destination.city.localeCompare(b.destination.city, 'ko');
      if (a.estimatedTotalKrw == null) return 1;
      if (b.estimatedTotalKrw == null) return -1;
      return a.estimatedTotalKrw - b.estimatedTotalKrw;
    });
  }

  // recommended: prefer in-budget, then higher remaining %, then lower cost
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

export async function recommendDestinations(
  form: TravelSearchFormState,
  sort: RecommendationSort = 'lowest_cost',
): Promise<DestinationRecommendation[]> {
  const totalBudgetKrw = form.budgetPerPerson * form.travelers;
  const nights = Math.max(1, form.tripLengthDays - 1);
  const { flights, stays } = buildProviders();

  const rows = await Promise.all(
    MOCK_DESTINATIONS.map(async (destination) => {
      const [flight, lodging] = await Promise.all([
        flights.searchFlights({
          originAirports: form.departureAirports,
          destinationAirport: destination.airportCode,
          travelers: form.travelers,
          tripLengthDays: form.tripLengthDays,
          departureDate: form.departureDate,
          returnDate: form.returnDate,
          destinationId: destination.id,
        }),
        stays.searchAccommodations({
          city: destination.city,
          country: destination.country,
          travelers: form.travelers,
          nights,
          checkInDate: form.departureDate,
          checkOutDate: form.returnDate,
          destinationId: destination.id,
        }),
      ]);

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
        isMock: true,
      };

      return recommendation;
    }),
  );

  return sortRecommendations(rows, sort);
}
