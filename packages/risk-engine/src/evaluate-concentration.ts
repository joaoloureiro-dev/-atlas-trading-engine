import {
    MARKET_TYPES,
    parseTimestamp,
    type PortfolioConcentration,
    type RiskLimits,
    type TradeProposal,
} from "@atlas/contracts";

/**
 * Oldest concentration snapshot accepted for a risk decision.
 */
export const MAX_SNAPSHOT_AGE_MS = 60_000;

const MAX_CLOCK_SKEW_MS = 5_000;

/**
 * Capacity smaller than this fraction of portfolio capital is rounding
 * residue of a market sitting exactly at its limit, not room for a trade.
 */
const DUST_CAPACITY_RATIO = 1e-9;

export interface EvaluateConcentrationInput {
    proposal: TradeProposal;
    limits: RiskLimits;
    concentration: PortfolioConcentration;

    /**
     * Total capital of the portfolio in its base currency. Concentration
     * percentages are measured against it, not against current exposure, so
     * they work the same for an empty, small or fully invested portfolio.
     */
    portfolioCapital: number;

    proposedCapital: number;
}

export interface ConcentrationDecision {
    approved: boolean;
    reason?: string;
}

export type ConcentrationCapacity =
    | { approved: true; maxCapital: number }
    | { approved: false; reason: string };

export function evaluateConcentration(
    input: EvaluateConcentrationInput,
): ConcentrationDecision {
    // Copy the inputs once so getters or proxies cannot change values
    // between validation and use.
    const {
        proposal,
        limits,
        concentration,
        portfolioCapital,
        proposedCapital,
    } = structuredClone(input);

    const invalid = validateConcentrationInputs(
        proposal,
        limits,
        concentration,
        portfolioCapital,
    );

    if (invalid) {
        return { approved: false, reason: invalid };
    }

    if (!Number.isFinite(proposedCapital) || proposedCapital <= 0) {
        return {
            approved: false,
            reason: "Proposed capital must be greater than zero.",
        };
    }

    const market = proposal.instrument.market;

    const currentMarketExposure =
        concentration.markets.find(
            (entry) => entry.market === market,
        )?.exposure ?? 0;

    const projectedMarketExposure =
        currentMarketExposure + proposedCapital;

    const projectedConcentrationPercentage =
        (projectedMarketExposure / portfolioCapital) * 100;

    if (
        projectedConcentrationPercentage >
        limits.maxMarketConcentrationPercentage
    ) {
        return {
            approved: false,
            reason:
                "Maximum market concentration would be exceeded.",
        };
    }

    const marketLimit = limits.marketLimits?.[market];

    if (
        marketLimit &&
        projectedMarketExposure >
        marketLimit.maxExposure
    ) {
        return {
            approved: false,
            reason:
                "Maximum market-specific exposure would be exceeded.",
        };
    }

    if (
        marketLimit &&
        projectedConcentrationPercentage >
        marketLimit.maxConcentrationPercentage
    ) {
        return {
            approved: false,
            reason:
                "Maximum market-specific concentration would be exceeded.",
        };
    }

    return {
        approved: true,
    };
}

/**
 * Largest capital a new trade in the proposal's market can add without
 * breaking the concentration limits, so the trade can be sized to fit.
 */
export function calculateConcentrationCapacity(
    input: Omit<EvaluateConcentrationInput, "proposedCapital">,
): ConcentrationCapacity {
    const {
        proposal,
        limits,
        concentration,
        portfolioCapital,
    } = structuredClone(input);

    const invalid = validateConcentrationInputs(
        proposal,
        limits,
        concentration,
        portfolioCapital,
    );

    if (invalid) {
        return { approved: false, reason: invalid };
    }

    const market = proposal.instrument.market;

    const current =
        concentration.markets.find(
            (entry) => entry.market === market,
        )?.exposure ?? 0;

    const marketLimit = limits.marketLimits?.[market];

    // Solves (current + x) / portfolioCapital <= percentage / 100 for x.
    const capacityAtPercentage = (percentage: number): number =>
        Math.max(0, (percentage / 100) * portfolioCapital - current);

    const maxCapital = Math.min(
        capacityAtPercentage(limits.maxMarketConcentrationPercentage),
        marketLimit
            ? Math.max(0, marketLimit.maxExposure - current)
            : Number.POSITIVE_INFINITY,
        marketLimit
            ? capacityAtPercentage(marketLimit.maxConcentrationPercentage)
            : Number.POSITIVE_INFINITY,
    );

    if (maxCapital <= portfolioCapital * DUST_CAPACITY_RATIO) {
        return { approved: true, maxCapital: 0 };
    }

    // Leave a sliver of room so rounding cannot push a trade sized exactly
    // to the limit over it.
    return {
        approved: true,
        maxCapital: Number.isFinite(maxCapital)
            ? maxCapital * (1 - 1e-9)
            : maxCapital,
    };
}

function validateConcentrationInputs(
    proposal: TradeProposal,
    limits: RiskLimits,
    concentration: PortfolioConcentration,
    portfolioCapital: number,
): string | undefined {
    if (proposal.tenantId !== limits.tenantId) {
        throw new Error(
            "Concentration evaluation received a proposal from another tenant.",
        );
    }

    if (
        typeof concentration !== "object" ||
        concentration === null ||
        !Array.isArray(concentration.markets) ||
        !concentration.markets.every(
            (entry) => typeof entry === "object" && entry !== null,
        )
    ) {
        return "Concentration snapshot is malformed.";
    }

    if (concentration.tenantId !== limits.tenantId) {
        throw new Error(
            "Concentration snapshot belongs to another tenant.",
        );
    }

    if (concentration.portfolioId !== limits.portfolioId) {
        throw new Error(
            "Concentration snapshot belongs to another portfolio.",
        );
    }

    if (proposal.portfolioId !== limits.portfolioId) {
        throw new Error(
            "Concentration evaluation received a proposal for another portfolio.",
        );
    }

    if (
        typeof proposal.instrument !== "object" ||
        proposal.instrument === null ||
        !MARKET_TYPES.includes(proposal.instrument.market)
    ) {
        return "Trade market is invalid.";
    }

    if (
        typeof portfolioCapital !== "number" ||
        !Number.isFinite(portfolioCapital) ||
        portfolioCapital <= 0
    ) {
        return "Portfolio capital must be a positive finite number.";
    }

    const snapshotAge =
        Date.now() - parseTimestamp(concentration.calculatedAt);

    if (
        !Number.isFinite(snapshotAge) ||
        snapshotAge > MAX_SNAPSHOT_AGE_MS ||
        snapshotAge < -MAX_CLOCK_SKEW_MS
    ) {
        return "Concentration snapshot is missing a valid recent timestamp.";
    }

    // Comparisons against NaN are always false, so invalid inputs must be
    // rejected explicitly or the limit checks silently pass.
    if (
        !Number.isFinite(limits.maxMarketConcentrationPercentage) ||
        limits.maxMarketConcentrationPercentage <= 0
    ) {
        return "Market concentration limit must be a positive finite number.";
    }

    if (
        !Number.isFinite(concentration.grossExposure) ||
        concentration.grossExposure < 0 ||
        !concentration.markets.every(
            ({ exposure }) =>
                Number.isFinite(exposure) && exposure >= 0,
        )
    ) {
        return "Concentration snapshot must contain valid non-negative exposures.";
    }

    const markets = concentration.markets.map(
        ({ market }) => market,
    );

    if (
        !markets.every((market) => MARKET_TYPES.includes(market)) ||
        new Set(markets).size !== markets.length
    ) {
        return "Concentration snapshot markets must be valid and unique.";
    }

    const marketExposureTotal = concentration.markets.reduce(
        (total, { exposure }) => total + exposure,
        0,
    );

    if (
        !approximatelyEqual(
            marketExposureTotal,
            concentration.grossExposure,
        )
    ) {
        return "Concentration snapshot gross exposure does not match its markets.";
    }

    const marketLimit =
        limits.marketLimits?.[proposal.instrument.market];

    if (
        marketLimit &&
        (
            !Number.isFinite(marketLimit.maxExposure) ||
            marketLimit.maxExposure < 0 ||
            !Number.isFinite(marketLimit.maxConcentrationPercentage) ||
            marketLimit.maxConcentrationPercentage < 0
        )
    ) {
        return "Market-specific limits must be valid non-negative numbers.";
    }

    return undefined;
}

export function approximatelyEqual(a: number, b: number): boolean {
    return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
}
