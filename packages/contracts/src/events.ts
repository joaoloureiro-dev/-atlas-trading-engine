export const ATLAS_EVENT_TYPES = [
    "TRADE_PROPOSAL_CREATED",
    "RISK_DECISION_CREATED",
    "ORDER_INTENT_CREATED",
    "ORDER_SUBMITTED",
    "ORDER_PARTIALLY_FILLED",
    "ORDER_FILLED",
    "ORDER_CANCELLED",
    "ORDER_REJECTED",
    "POSITION_OPENED",
    "POSITION_UPDATED",
    "POSITION_CLOSED",
    "MODEL_EVALUATED",
    "RISK_LIMIT_TRIGGERED",
    "TRADING_HALTED",
] as const;

export type AtlasEventType =
    (typeof ATLAS_EVENT_TYPES)[number];

export interface AtlasEvent<TPayload = unknown> {
    id: string;

    type: AtlasEventType;

    tenantId: string;

    /**
     * User responsible for the action when the event
     * originated from a user interaction.
     *
     * System-generated events may not have an actor.
     */
    actorUserId?: string;

    correlationId: string;
    causationId?: string;

    payload: TPayload;

    occurredAt: string;
}