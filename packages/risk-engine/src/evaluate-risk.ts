import {
    MARKET_TYPES,
    TRADE_DIRECTIONS,
    TRADING_MODES,
    parseTimestamp,
    type Portfolio,
    type RiskDecision,
    type RiskLimits,
    type TradeProposal,
} from "@atlas/contracts";

/**
 * Longest window a proposal may be valid for, measured from its creation.
 */
export const MAX_PROPOSAL_TTL_MS = 15 * 60_000;

/**
 * Tolerated clock skew for proposal creation timestamps.
 */
const MAX_CLOCK_SKEW_MS = 5_000;

export interface EvaluateRiskInput {
    decisionId: string;

    proposal: TradeProposal;
    limits: RiskLimits;

    /**
     * Trusted portfolio configuration. The trading mode always comes from
     * here, never from the proposal.
     */
    portfolio: Portfolio;

    currentGrossExposure: number;
    currentNetExposure: number;

    currentDailyPnl: number;
    currentDrawdownPercentage: number;

    currentOpenPositions: number;

    /**
     * Largest capital the portfolio's concentration limits allow for this
     * trade. The trade is sized down to fit instead of being rejected.
     */
    maxCapitalByConcentration?: number;
}

export function evaluateRisk(
    input: EvaluateRiskInput,
): RiskDecision {
    // Copy the inputs once so getters or proxies cannot return one value
    // during validation and a different one during sizing.
    const {
        decisionId,
        proposal,
        limits,
        portfolio,
        currentGrossExposure,
        currentNetExposure,
        currentDailyPnl,
        currentDrawdownPercentage,
        currentOpenPositions,
        maxCapitalByConcentration = Number.POSITIVE_INFINITY,
    } = structuredClone(input);

    const reject = (reason: string): RiskDecision => ({
        id: decisionId,
        tenantId: proposal.tenantId,
        portfolioId: proposal.portfolioId,
        tradeProposalId: proposal.id,

        instrument: proposal.instrument,
        direction: proposal.direction,
        entryPrice: proposal.suggestedEntry ?? 0,

        status: "REJECTED",

        approvedCapital: 0,

        maxLoss: 0,

        stopLossPrice: proposal.invalidationPrice,

        tradingMode: portfolio.tradingMode,

        reasons: [reason],

        createdAt: new Date().toISOString(),
        expiresAt: proposal.expiresAt,
    });

    if (proposal.tenantId !== limits.tenantId) {
        throw new Error(
            "Risk evaluation received a proposal from another tenant.",
        );
    }

    if (
        portfolio.tenantId !== limits.tenantId ||
        portfolio.id !== limits.portfolioId
    ) {
        throw new Error(
            "Risk limits do not belong to the supplied portfolio.",
        );
    }

    if (proposal.portfolioId !== limits.portfolioId) {
        throw new Error(
            "Risk evaluation received a proposal for another portfolio.",
        );
    }

    if (!TRADING_MODES.includes(portfolio.tradingMode)) {
        return reject("Portfolio trading mode is invalid.");
    }

    if (proposal.tradingMode !== portfolio.tradingMode) {
        return reject(
            "Proposal trading mode does not match the portfolio trading mode.",
        );
    }

    if (!TRADE_DIRECTIONS.includes(proposal.direction)) {
        return reject("Trade direction must be LONG or SHORT.");
    }

    if (
        typeof proposal.instrument !== "object" ||
        proposal.instrument === null ||
        !MARKET_TYPES.includes(proposal.instrument.market) ||
        typeof proposal.instrument.symbol !== "string" ||
        proposal.instrument.symbol.trim() === "" ||
        proposal.instrument.symbol.trim() !== proposal.instrument.symbol
    ) {
        return reject("Trade instrument is invalid.");
    }

    const positiveLimits = [
        limits.maxPositionNotional,
        limits.maxRiskPerTrade,
        limits.maxGrossExposure,
        limits.maxNetExposure,
        limits.maxDailyLoss,
        limits.maxDrawdownPercentage,
        limits.maxMarketConcentrationPercentage,
    ];

    // Comparisons against NaN are always false, so every value used by a
    // limit check must be validated first or the check silently passes.
    if (!positiveLimits.every(isPositiveFinite)) {
        return reject(
            "Risk limits must be positive finite numbers.",
        );
    }

    if (
        limits.maxOpenPositions !== undefined &&
        !isNonNegativeInteger(limits.maxOpenPositions)
    ) {
        return reject(
            "Maximum open positions limit must be a valid non-negative integer.",
        );
    }

    if (!isNonNegativeInteger(currentOpenPositions)) {
        return reject(
            "Current open position count must be a valid non-negative integer.",
        );
    }

    if (
        !Number.isFinite(currentGrossExposure) ||
        currentGrossExposure < 0 ||
        !Number.isFinite(currentNetExposure) ||
        !Number.isFinite(currentDailyPnl) ||
        !Number.isFinite(currentDrawdownPercentage) ||
        currentDrawdownPercentage < 0
    ) {
        return reject(
            "Current portfolio state must contain valid finite numbers.",
        );
    }

    const now = Date.now();
    const createdAt = parseTimestamp(proposal.createdAt);
    const expiresAt = parseTimestamp(proposal.expiresAt);

    if (!Number.isFinite(expiresAt) || expiresAt <= now) {
        return reject("Trade proposal has expired.");
    }

    if (
        !Number.isFinite(createdAt) ||
        createdAt > now + MAX_CLOCK_SKEW_MS ||
        expiresAt - createdAt > MAX_PROPOSAL_TTL_MS
    ) {
        return reject(
            "Trade proposal validity window is invalid or too long.",
        );
    }

    if (
        limits.maxOpenPositions !== undefined &&
        currentOpenPositions >= limits.maxOpenPositions
    ) {
        return reject(
            "Maximum number of open positions reached.",
        );
    }

    if (currentDailyPnl <= -limits.maxDailyLoss) {
        return reject("Maximum daily loss reached.");
    }

    if (
        currentDrawdownPercentage >=
        limits.maxDrawdownPercentage
    ) {
        return reject("Maximum drawdown reached.");
    }

    if (
        currentGrossExposure >=
        limits.maxGrossExposure
    ) {
        return reject("Maximum gross exposure reached.");
    }

    if (
        Number.isNaN(maxCapitalByConcentration) ||
        maxCapitalByConcentration < 0
    ) {
        return reject(
            "Concentration capital limit must be a non-negative number.",
        );
    }

    // A trade that reduces net exposure is allowed even when net exposure is
    // at its limit, so the check depends on the direction.
    const netExposureHeadroom =
        proposal.direction === "LONG"
            ? limits.maxNetExposure -
            currentNetExposure
            : limits.maxNetExposure +
            currentNetExposure;

    if (netExposureHeadroom <= 0) {
        return reject("Maximum net exposure reached.");
    }

    const entryPrice = proposal.suggestedEntry;

    if (
        entryPrice === undefined ||
        !Number.isFinite(entryPrice) ||
        entryPrice <= 0
    ) {
        return reject(
            "A valid suggested entry price is required for risk sizing.",
        );
    }

    if (
        !Number.isFinite(proposal.invalidationPrice) ||
        proposal.invalidationPrice <= 0
    ) {
        return reject(
            "A valid invalidation price is required.",
        );
    }

    if (
        proposal.direction === "LONG" &&
        proposal.invalidationPrice >= entryPrice
    ) {
        return reject(
            "Long trade invalidation price must be below entry price.",
        );
    }

    if (
        proposal.direction === "SHORT" &&
        proposal.invalidationPrice <= entryPrice
    ) {
        return reject(
            "Short trade invalidation price must be above entry price.",
        );
    }

    const riskPerUnit = Math.abs(
        entryPrice - proposal.invalidationPrice,
    );

    if (!Number.isFinite(riskPerUnit) || riskPerUnit <= 0) {
        return reject(
            "Trade risk per unit must be greater than zero.",
        );
    }

    // A single trade must not be able to push the day past its loss limit.
    const remainingDailyLoss =
        limits.maxDailyLoss + currentDailyPnl;

    const riskBudget = Math.min(
        limits.maxRiskPerTrade,
        remainingDailyLoss,
    );

    const quantityByRisk =
        riskBudget / riskPerUnit;

    const notionalByRisk =
        quantityByRisk * entryPrice;

    const grossExposureHeadroom =
        limits.maxGrossExposure -
        currentGrossExposure;

    const capitalCap = Math.min(
        limits.maxPositionNotional,
        notionalByRisk,
        grossExposureHeadroom,
        netExposureHeadroom,
        maxCapitalByConcentration,
    );

    if (
        !Number.isFinite(capitalCap) ||
        capitalCap <= 0
    ) {
        return reject(
            "No portfolio risk capacity is available for this trade.",
        );
    }

    // Floating point division can land a hair above the caps, so shrink the
    // quantity until both the capital and the loss stay within them.
    const exceedsCaps = (quantity: number): boolean =>
        quantity * entryPrice > capitalCap ||
        quantity * riskPerUnit > riskBudget;

    let approvedQuantity = capitalCap / entryPrice;

    for (
        let attempt = 0;
        attempt < 16 && exceedsCaps(approvedQuantity);
        attempt++
    ) {
        approvedQuantity *= 1 - Number.EPSILON;
    }

    const approvedCapital = approvedQuantity * entryPrice;
    const maxLoss = approvedQuantity * riskPerUnit;

    if (
        !Number.isFinite(approvedQuantity) ||
        approvedQuantity <= 0 ||
        approvedCapital <= 0 ||
        maxLoss <= 0 ||
        exceedsCaps(approvedQuantity)
    ) {
        return reject(
            "Approved trade size is too small to execute.",
        );
    }

    return {
        id: decisionId,
        tenantId: proposal.tenantId,
        portfolioId: proposal.portfolioId,
        tradeProposalId: proposal.id,

        instrument: proposal.instrument,
        direction: proposal.direction,
        entryPrice,

        status: "APPROVED",

        approvedCapital,
        approvedQuantity,

        maxLoss,

        stopLossPrice: proposal.invalidationPrice,

        ...(proposal.suggestedTakeProfit !== undefined
            ? {
                takeProfitPrice:
                    proposal.suggestedTakeProfit,
            }
            : {}),

        tradingMode: portfolio.tradingMode,

        reasons: [
            "Hard risk checks passed.",
            "Position size was determined by portfolio and per-trade risk limits.",
        ],

        createdAt: new Date().toISOString(),
        expiresAt: new Date(expiresAt).toISOString(),
    };
}

function isPositiveFinite(value: number): boolean {
    return Number.isFinite(value) && value > 0;
}

function isNonNegativeInteger(value: number): boolean {
    return Number.isInteger(value) && value >= 0;
}
