import { describe, expect, it } from "vitest";

import type {
    OrderIntent,
    RiskDecision,
} from "@atlas/contracts";

import { validateOrderIntent } from "./validate-order-intent.js";

const riskDecision: RiskDecision = {
    id: "risk-1",
    tenantId: "tenant-1",
    tradeProposalId: "proposal-1",

    status: "APPROVED",

    approvedCapital: 1_000,
    approvedQuantity: 10,

    maxLoss: 50,

    stopLossPrice: 95,
    takeProfitPrice: 120,

    tradingMode: "PAPER",

    reasons: [
        "Hard risk checks passed.",
    ],

    createdAt: new Date().toISOString(),
};

const orderIntent: OrderIntent = {
    id: "order-1",

    tenantId: "tenant-1",

    tradeProposalId: "proposal-1",
    riskDecisionId: "risk-1",

    instrument: {
        symbol: "BTC-USD",
        market: "CRYPTO",
    },

    direction: "LONG",

    quantity: 10,

    orderType: "MARKET",

    tradingMode: "PAPER",

    idempotencyKey: "tenant-1:order-1",

    createdAt: new Date().toISOString(),
};

describe("validateOrderIntent", () => {
    it("accepts a valid order intent", () => {
        const result = validateOrderIntent({
            orderIntent,
            riskDecision,
        });

        expect(result.valid).toBe(true);
        expect(result.reasons).toEqual([]);
    });

    it("rejects execution without an approved risk decision", () => {
        const {
            approvedQuantity: _approvedQuantity,
            ...riskDecisionWithoutQuantity
        } = riskDecision;

        const rejectedDecision: RiskDecision = {
            ...riskDecisionWithoutQuantity,

            status: "REJECTED",

            approvedCapital: 0,

            maxLoss: 0,

            reasons: [
                "Risk checks failed.",
            ],
        };

        const result = validateOrderIntent({
            orderIntent,
            riskDecision: rejectedDecision,
        });

        expect(result.valid).toBe(false);

        expect(result.reasons).toContain(
            "Order execution requires an approved risk decision.",
        );

        expect(result.reasons).toContain(
            "Risk decision does not contain an approved quantity.",
        );
    });

    it("rejects quantity above the approved risk quantity", () => {
        const result = validateOrderIntent({
            orderIntent: {
                ...orderIntent,
                quantity: 11,
            },
            riskDecision,
        });

        expect(result.valid).toBe(false);

        expect(result.reasons).toContain(
            "Order quantity exceeds the quantity approved by risk.",
        );
    });

    it("throws on cross-tenant execution", () => {
        expect(() =>
            validateOrderIntent({
                orderIntent: {
                    ...orderIntent,
                    tenantId: "tenant-2",
                },
                riskDecision,
            }),
        ).toThrow(
            "Order intent and risk decision belong to different tenants.",
        );
    });

    it("rejects a missing idempotency key", () => {
        const result = validateOrderIntent({
            orderIntent: {
                ...orderIntent,
                idempotencyKey: " ",
            },
            riskDecision,
        });

        expect(result.valid).toBe(false);

        expect(result.reasons).toContain(
            "Order intent requires a non-empty idempotency key.",
        );
    });

    it("rejects a limit order without a valid limit price", () => {
        const result = validateOrderIntent({
            orderIntent: {
                ...orderIntent,
                orderType: "LIMIT",
            },
            riskDecision,
        });

        expect(result.valid).toBe(false);

        expect(result.reasons).toContain(
            "Limit orders require a valid limit price.",
        );
    });

    it("rejects a stop order without a valid stop price", () => {
        const result = validateOrderIntent({
            orderIntent: {
                ...orderIntent,
                orderType: "STOP",
            },
            riskDecision,
        });

        expect(result.valid).toBe(false);

        expect(result.reasons).toContain(
            "Stop orders require a valid stop price.",
        );
    });

    it("rejects a stop-limit order without both prices", () => {
        const result = validateOrderIntent({
            orderIntent: {
                ...orderIntent,
                orderType: "STOP_LIMIT",
                stopPrice: 95,
            },
            riskDecision,
        });

        expect(result.valid).toBe(false);

        expect(result.reasons).toContain(
            "Stop-limit orders require valid stop and limit prices.",
        );
    });

    it("rejects an order referencing another risk decision", () => {
        const result = validateOrderIntent({
            orderIntent: {
                ...orderIntent,
                riskDecisionId: "risk-2",
            },
            riskDecision,
        });

        expect(result.valid).toBe(false);

        expect(result.reasons).toContain(
            "Order intent does not reference the supplied risk decision.",
        );
    });

    it("rejects an order for another trade proposal", () => {
        const result = validateOrderIntent({
            orderIntent: {
                ...orderIntent,
                tradeProposalId: "proposal-2",
            },
            riskDecision,
        });

        expect(result.valid).toBe(false);

        expect(result.reasons).toContain(
            "Order intent does not match the approved trade proposal.",
        );
    });

    it("rejects a trading mode mismatch", () => {
        const result = validateOrderIntent({
            orderIntent: {
                ...orderIntent,
                tradingMode: "LIVE",
            },
            riskDecision,
        });

        expect(result.valid).toBe(false);

        expect(result.reasons).toContain(
            "Order trading mode does not match the risk decision.",
        );
    });

    it("rejects a non-positive order quantity", () => {
        const result = validateOrderIntent({
            orderIntent: {
                ...orderIntent,
                quantity: 0,
            },
            riskDecision,
        });

        expect(result.valid).toBe(false);

        expect(result.reasons).toContain(
            "Order quantity must be a positive finite number.",
        );
    });
});