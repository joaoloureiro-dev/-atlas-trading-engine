import type {
    OrderIntent,
    RiskDecision,
} from "@atlas/contracts";

export interface ValidateOrderIntentInput {
    orderIntent: OrderIntent;
    riskDecision: RiskDecision;
}

export interface OrderIntentValidationResult {
    valid: boolean;
    reasons: string[];
}

export function validateOrderIntent(
    input: ValidateOrderIntentInput,
): OrderIntentValidationResult {
    const {
        orderIntent,
        riskDecision,
    } = input;

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

    if (
        orderIntent.tradingMode !==
        riskDecision.tradingMode
    ) {
        reasons.push(
            "Order trading mode does not match the risk decision.",
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

    if (
        riskDecision.approvedQuantity === undefined
    ) {
        reasons.push(
            "Risk decision does not contain an approved quantity.",
        );
    } else if (
        orderIntent.quantity >
        riskDecision.approvedQuantity
    ) {
        reasons.push(
            "Order quantity exceeds the quantity approved by risk.",
        );
    }

    if (!orderIntent.idempotencyKey.trim()) {
        reasons.push(
            "Order intent requires a non-empty idempotency key.",
        );
    }

    if (
        orderIntent.orderType === "LIMIT" &&
        (
            orderIntent.limitPrice === undefined ||
            !Number.isFinite(orderIntent.limitPrice) ||
            orderIntent.limitPrice <= 0
        )
    ) {
        reasons.push(
            "Limit orders require a valid limit price.",
        );
    }

    if (
        orderIntent.orderType === "STOP" &&
        (
            orderIntent.stopPrice === undefined ||
            !Number.isFinite(orderIntent.stopPrice) ||
            orderIntent.stopPrice <= 0
        )
    ) {
        reasons.push(
            "Stop orders require a valid stop price.",
        );
    }

    if (
        orderIntent.orderType === "STOP_LIMIT" &&
        (
            orderIntent.stopPrice === undefined ||
            !Number.isFinite(orderIntent.stopPrice) ||
            orderIntent.stopPrice <= 0 ||
            orderIntent.limitPrice === undefined ||
            !Number.isFinite(orderIntent.limitPrice) ||
            orderIntent.limitPrice <= 0
        )
    ) {
        reasons.push(
            "Stop-limit orders require valid stop and limit prices.",
        );
    }

    return {
        valid: reasons.length === 0,
        reasons,
    };
}