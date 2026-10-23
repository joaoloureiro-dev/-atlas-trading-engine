import {
    ORDER_TYPES,
    TRADE_DIRECTIONS,
    TRADING_MODES,
    parseTimestamp,
    type Instrument,
    type OrderIntent,
    type RiskDecision,
} from "@atlas/contracts";

/**
 * Default tolerance between the approved entry price and the worst price an
 * order may fill at, in basis points.
 */
export const DEFAULT_MAX_SLIPPAGE_BPS = 50;

/**
 * Largest slippage tolerance a caller may configure.
 */
export const MAX_SLIPPAGE_BPS = 500;

export interface ValidateOrderIntentInput {
    orderIntent: OrderIntent;

    /**
     * Must be loaded by the gateway from the risk decision store using
     * orderIntent.riskDecisionId, never taken from the caller.
     */
    riskDecision: RiskDecision;

    /**
     * Quantity already reserved or submitted against this risk decision by
     * earlier order intents. A decision can never be executed beyond its
     * approved quantity in total.
     */
    reservedQuantity: number;

    maxSlippageBps?: number;
}

export interface OrderIntentValidationResult {
    valid: boolean;
    reasons: string[];
}

export function validateOrderIntent(
    input: ValidateOrderIntentInput,
): OrderIntentValidationResult {
    // Copy the inputs once so getters or proxies cannot change values
    // between validation and use.
    const {
        orderIntent,
        riskDecision,
        reservedQuantity,
        maxSlippageBps = DEFAULT_MAX_SLIPPAGE_BPS,
    } = structuredClone(input);

    const reasons: string[] = [];

    if (
        !isInstrument(orderIntent.instrument) ||
        !isInstrument(riskDecision.instrument)
    ) {
        return {
            valid: false,
            reasons: ["Order intent or risk decision is malformed."],
        };
    }

    if (
        orderIntent.tenantId !==
        riskDecision.tenantId
    ) {
        throw new Error(
            "Order intent and risk decision belong to different tenants.",
        );
    }

    if (
        orderIntent.riskDecisionId !==
        riskDecision.id
    ) {
        reasons.push(
            "Order intent does not reference the supplied risk decision.",
        );
    }

    if (
        orderIntent.tradeProposalId !==
        riskDecision.tradeProposalId
    ) {
        reasons.push(
            "Order intent does not match the approved trade proposal.",
        );
    }

    if (
        riskDecision.status !== "APPROVED"
    ) {
        reasons.push(
            "Order execution requires an approved risk decision.",
        );
    }

    const expiresAt = parseTimestamp(riskDecision.expiresAt);

    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
        reasons.push(
            "Risk decision has expired.",
        );
    }

    if (
        !TRADING_MODES.includes(orderIntent.tradingMode) ||
        orderIntent.tradingMode !==
        riskDecision.tradingMode
    ) {
        reasons.push(
            "Order trading mode does not match the risk decision.",
        );
    }

    if (
        !TRADE_DIRECTIONS.includes(orderIntent.direction) ||
        orderIntent.direction !==
        riskDecision.direction
    ) {
        reasons.push(
            "Order direction does not match the risk decision.",
        );
    }

    if (
        orderIntent.instrument.symbol !==
        riskDecision.instrument.symbol ||
        orderIntent.instrument.market !==
        riskDecision.instrument.market ||
        orderIntent.instrument.externalId !==
        riskDecision.instrument.externalId ||
        orderIntent.instrument.baseAsset !==
        riskDecision.instrument.baseAsset ||
        orderIntent.instrument.quoteAsset !==
        riskDecision.instrument.quoteAsset
    ) {
        reasons.push(
            "Order instrument does not match the risk decision.",
        );
    }

    if (!ORDER_TYPES.includes(orderIntent.orderType)) {
        reasons.push(
            "Order type is not supported.",
        );
    }

    const quantityValid = isPositiveFinite(orderIntent.quantity);

    if (!quantityValid) {
        reasons.push(
            "Order quantity must be a positive finite number.",
        );
    }

    // Comparisons against NaN are always false, so the approved quantity and
    // the reserved quantity must be validated before the cap below.
    if (!isPositiveFinite(riskDecision.approvedQuantity)) {
        reasons.push(
            "Risk decision does not contain a valid approved quantity.",
        );
    } else if (
        typeof reservedQuantity !== "number" ||
        !Number.isFinite(reservedQuantity) ||
        reservedQuantity < 0
    ) {
        reasons.push(
            "Reserved quantity must be a non-negative finite number.",
        );
    } else if (
        quantityValid &&
        // Compare against what is left rather than adding to the reserved
        // quantity: a tiny order added to a large total can round away and
        // pass again and again.
        orderIntent.quantity >
        riskDecision.approvedQuantity - reservedQuantity
    ) {
        reasons.push(
            "Order quantity exceeds the quantity approved by risk.",
        );
    }

    if (
        typeof orderIntent.idempotencyKey !== "string" ||
        !orderIntent.idempotencyKey.trim()
    ) {
        reasons.push(
            "Order intent requires a non-empty idempotency key.",
        );
    }

    const {
        entryPrice,
        stopLossPrice,
        maxLoss,
        approvedCapital,
    } = riskDecision;

    const decisionPricesValid =
        isPositiveFinite(entryPrice) &&
        isPositiveFinite(stopLossPrice) &&
        isPositiveFinite(maxLoss) &&
        isPositiveFinite(approvedCapital) &&
        (
            riskDecision.direction === "LONG"
                ? stopLossPrice < entryPrice
                : stopLossPrice > entryPrice
        );

    if (!decisionPricesValid) {
        reasons.push(
            "Risk decision prices, loss or capital are invalid.",
        );
    }

    const slippageValid =
        typeof maxSlippageBps === "number" &&
        Number.isFinite(maxSlippageBps) &&
        maxSlippageBps >= 0 &&
        maxSlippageBps <= MAX_SLIPPAGE_BPS;

    if (!slippageValid) {
        reasons.push(
            `Maximum slippage must be between 0 and ${MAX_SLIPPAGE_BPS} basis points.`,
        );
    }

    const { orderType, limitPrice, stopPrice } = orderIntent;

    if (
        orderType === "MARKET" &&
        !isPositiveFinite(limitPrice)
    ) {
        // A market order must carry a worst acceptable price.
        reasons.push(
            "Market orders require a worst acceptable price.",
        );
    }

    if (
        orderType === "LIMIT" &&
        !isPositiveFinite(limitPrice)
    ) {
        reasons.push(
            "Limit orders require a valid limit price.",
        );
    }

    if (
        orderType === "STOP" &&
        !isPositiveFinite(stopPrice)
    ) {
        reasons.push(
            "Stop orders require a valid stop price.",
        );
    }

    if (
        orderType === "STOP" &&
        !isPositiveFinite(limitPrice)
    ) {
        // A triggered stop fills at market, so it needs a worst price too.
        reasons.push(
            "Stop orders require a worst acceptable price.",
        );
    }

    if (
        orderType === "STOP_LIMIT" &&
        (
            !isPositiveFinite(stopPrice) ||
            !isPositiveFinite(limitPrice)
        )
    ) {
        reasons.push(
            "Stop-limit orders require valid stop and limit prices.",
        );
    }

    if (decisionPricesValid && slippageValid && quantityValid) {
        const slippage = maxSlippageBps / 10_000;

        // Prices must stay on the profitable side of the stop loss and within
        // the slippage band around the approved entry.
        const tolerance = entryPrice * slippage;

        const { quantity } = orderIntent;

        // Filling at this price must not lose more than risk approved at the
        // stop, nor use more capital than approved.
        const withinRisk = (price: number): boolean =>
            quantity * Math.abs(price - stopLossPrice) <= maxLoss &&
            quantity * price <= approvedCapital;

        const withinBand = (price: number): boolean =>
            withinRisk(price) &&
            (
                riskDecision.direction === "LONG"
                    ? price > stopLossPrice &&
                    price <= entryPrice + tolerance
                    : price < stopLossPrice &&
                    price >= entryPrice - tolerance
            );

        const prices = [
            limitPrice,
            stopPrice,
        ].filter(
            (price): price is number => price !== undefined,
        );

        if (
            prices.some(
                (price) =>
                    !isPositiveFinite(price) ||
                    !withinBand(price),
            )
        ) {
            reasons.push(
                "Order prices must be within the approved entry band, the approved risk and on the correct side of the stop loss.",
            );
        }
    }

    return {
        valid: reasons.length === 0,
        reasons,
    };
}

function isPositiveFinite(value: number | undefined): value is number {
    return (
        typeof value === "number" &&
        Number.isFinite(value) &&
        value > 0
    );
}

function isInstrument(value: unknown): value is Instrument {
    return (
        typeof value === "object" &&
        value !== null &&
        typeof (value as Instrument).symbol === "string" &&
        typeof (value as Instrument).market === "string"
    );
}
