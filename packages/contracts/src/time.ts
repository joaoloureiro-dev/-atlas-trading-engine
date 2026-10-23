const ISO_TIMESTAMP_PATTERN =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/;

/**
 * Parses an ISO-8601 timestamp with an explicit UTC offset.
 *
 * Returns NaN for anything else. Timestamps without an offset are read in the
 * local time zone of whichever service parses them, so the same expiry would
 * mean different instants in different services.
 */
export function parseTimestamp(value: unknown): number {
    if (
        typeof value !== "string" ||
        !ISO_TIMESTAMP_PATTERN.test(value)
    ) {
        return Number.NaN;
    }

    return Date.parse(value);
}
