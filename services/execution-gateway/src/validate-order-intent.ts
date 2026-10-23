import {
    ORDER_TYPES,
    TRADE_DIRECTIONS,
    TRADING_MODES,
    type OrderIntent,
    type RiskDecision,
} from "@atlas/contracts";

/**
 * Default tolerance between the approved entry price and the worst price an
 * order may fill at, in basis points.
 */
export const DEFAULT_MAX_SLIPPAGE_BPS = 50;

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

    const expiresAt = Date.parse(riskDecision.expiresAt);

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
        riskDecision.instrument.externalId
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

    if (
        !Number.isFinite(orderIntent.quantity) ||
        orderIntent.quantity <= 0
    ) {
        reasons.push(
            "Order quantity must be a positive finite number.",
        );
    }

    // Comparisons against NaN are always false, so the approved quantity and
    // the reserved quantity must be validated before the cap below.
    if (
        riskDecision.approvedQuantity === undefined ||
        !Number.isFinite(riskDecision.approvedQuantity) ||
        riskDecision.approvedQuantity <= 0
    ) {
        reasons.push(
            "Risk decision does not contain a valid approved quantity.",
        );
    } else if (
        !Number.isFinite(reservedQuantity) ||
        reservedQuantity < 0
    ) {
        reasons.push(
            "Reserved quantity must be a non-negative finite number.",
        );
    } else if (
        orderIntent.quantity + reservedQuantity >
        riskDecision.approvedQuantity
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

    const { entryPrice, stopLossPrice } = riskDecision;

    const decisionPricesValid =
        isPositiveFinite(entryPrice) &&
        isPositiveFinite(stopLossPrice) &&
        (
            riskDecision.direction === "LONG"
                ? stopLossPrice < entryPrice
                : stopLossPrice > entryPrice
        );

    if (!decisionPricesValid) {
        reasons.push(
            "Risk decision entry and stop loss prices are invalid.",
        );
    }

    if (
        !Number.isFinite(maxSlippageBps) ||
        maxSlippageBps < 0
    ) {
        reasons.push(
            "Maximum slippage must be a non-negative finite number.",
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

    if (decisionPricesValid) {
        const slippage = maxSlippageBps / 10_000;

        // Prices must stay on the profitable side of the stop loss and within
        // the slippage band around the approved entry.
        const tolerance = entryPrice * slippage;

        const withinBand = (price: number): boolean =>
            riskDecision.direction === "LONG"
                ? price > stopLossPrice &&
                price <= entryPrice + tolerance
                : price < stopLossPrice &&
                price >= entryPrice - tolerance;

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
                "Order prices must be within the approved entry band and on the correct side of the stop loss.",
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
