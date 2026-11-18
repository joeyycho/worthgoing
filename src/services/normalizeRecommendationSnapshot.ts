import type {
  CostBreakdown,
  DestinationRecommendation,
  LocalSpendEstimate,
  LocalSpendMeta,
  SearchCostTotals,
} from '../types/recommendation';
import { buildSearchCostTotals } from './recommendDestinations';
import type { TripSnapshot } from '../types/tripStore';

const SYNTHETIC_LOCAL_SPEND_META: LocalSpendMeta = {
  source: 'catalog_daily_estimate',
  confidence: 'low',
  isEstimated: true,
};

function isValidKrw(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function pickKrw(...candidates: unknown[]): number | null {
  for (const candidate of candidates) {
    if (isValidKrw(candidate)) {
      return candidate;
    }
  }
  return null;
}

/**
 * Sum only finite local-spend fields. Never invent transport when absent.
 * Returns null when no valid local amount exists.
 */
export function sumLegacyLocalSpend(local: LocalSpendEstimate): number | null {
  let sum = 0;
  let any = false;
  for (const key of ['activityKrw', 'foodKrw', 'shoppingKrw'] as const) {
    const value = local[key];
    if (isValidKrw(value)) {
      sum += value;
      any = true;
    }
  }
  if (isValidKrw(local.transportKrw)) {
    sum += local.transportKrw;
    any = true;
  }
  return any ? sum : null;
}

function deriveSearchCost(
  raw: DestinationRecommendation,
): SearchCostTotals {
  const flightTotalKrw = pickKrw(
    raw.searchCost?.flightTotalKrw,
    raw.flight?.totalFareKrw,
    raw.breakdown?.flightKrw,
  );
  const stayTotalKrw = pickKrw(
    raw.searchCost?.stayTotalKrw,
    raw.lodging?.totalStayKrw,
    raw.breakdown?.lodgingKrw,
  );
  return buildSearchCostTotals(flightTotalKrw, stayTotalKrw);
}

function normalizeBreakdown(
  raw: DestinationRecommendation,
  searchCost: SearchCostTotals,
  localSpend: LocalSpendEstimate | null,
): CostBreakdown {
  const breakdown = raw.breakdown;
  const next: CostBreakdown = {
    flightKrw: pickKrw(breakdown?.flightKrw, searchCost.flightTotalKrw),
    lodgingKrw: pickKrw(breakdown?.lodgingKrw, searchCost.stayTotalKrw),
    activityKrw: pickKrw(breakdown?.activityKrw, localSpend?.activityKrw),
    foodKrw: pickKrw(breakdown?.foodKrw, localSpend?.foodKrw),
    shoppingKrw: pickKrw(breakdown?.shoppingKrw, localSpend?.shoppingKrw),
  };

  const transport = pickKrw(breakdown?.transportKrw, localSpend?.transportKrw);
  if (transport != null) {
    next.transportKrw = transport;
  }
  // Do not invent transportKrw: 0 / omit when unimplemented.

  return next;
}

/**
 * Convert legacy (pre-#20) and current recommendation snapshots into a UI-safe shape.
 * Does not mutate the input. Idempotent for already-current snapshots.
 *
 * Rules:
 * - Derive `searchCost` from trustworthy flight/stay/breakdown totals only; invent nothing.
 * - `searchCostTotalKrw` only when both flight and stay are valid.
 * - `estimatedTripTotalKrw ??= estimatedTotalKrw` — never overwrite a valid new trip total.
 * - Keep `estimatedTotalKrw` when present.
 * - Legacy localSpend without total → sum valid fields (no double-count vs breakdown; no invented transport).
 * - Synthesize estimate `localSpendMeta` when local present but meta missing.
 * - Leave legacy `within_budget` / `over_budget` / `price_unknown` statuses as-is (labels already estimate-worded).
 * - Do NOT overwrite, default, or invent flight/lodging `isMock` / `priceMode` (price provenance).
 */
export function normalizeRecommendationSnapshot(
  raw: DestinationRecommendation,
): DestinationRecommendation {
  const searchCost = deriveSearchCost(raw);

  const localSpend: LocalSpendEstimate | null =
    raw.localSpend == null
      ? null
      : {
          activityKrw: raw.localSpend.activityKrw,
          foodKrw: raw.localSpend.foodKrw,
          shoppingKrw: raw.localSpend.shoppingKrw,
          ...(isValidKrw(raw.localSpend.transportKrw)
            ? { transportKrw: raw.localSpend.transportKrw }
            : {}),
        };

  let localSpendTotalKrw: number | null = isValidKrw(raw.localSpendTotalKrw)
    ? raw.localSpendTotalKrw
    : null;
  if (localSpendTotalKrw == null && localSpend != null) {
    localSpendTotalKrw = sumLegacyLocalSpend(localSpend);
  }
  if (localSpend == null) {
    localSpendTotalKrw = null;
  }

  let localSpendMeta: LocalSpendMeta | null = raw.localSpendMeta ?? null;
  if (localSpend != null && localSpendMeta == null) {
    localSpendMeta = { ...SYNTHETIC_LOCAL_SPEND_META };
  }
  if (localSpend == null) {
    localSpendMeta = null;
  }

  const estimatedTripTotalKrw =
    pickKrw(raw.estimatedTripTotalKrw) ?? pickKrw(raw.estimatedTotalKrw);

  const estimatedTotalKrw =
    pickKrw(raw.estimatedTotalKrw) ?? estimatedTripTotalKrw;

  const breakdown = normalizeBreakdown(raw, searchCost, localSpend);

  return {
    ...raw,
    searchCost,
    localSpend,
    localSpendMeta,
    localSpendTotalKrw,
    breakdown,
    estimatedTripTotalKrw,
    estimatedTotalKrw,
    // Preserve legacy statuses — BUDGET_STATUS_LABEL maps them to estimate copy.
    status: raw.status,
  };
}

/** Normalize the recommendation inside a persisted trip snapshot (read boundary). */
export function normalizeTripSnapshot(snapshot: TripSnapshot): TripSnapshot {
  return {
    ...snapshot,
    recommendation: normalizeRecommendationSnapshot(snapshot.recommendation),
  };
}
