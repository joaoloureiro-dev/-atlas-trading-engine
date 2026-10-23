const ISO_TIMESTAMP_PATTERN =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/;

/**
 * Parses an ISO-8601 timestamp with an explicit UTC offset.
 *
 * Returns NaN for anything else. Timestamps without an offset are read in the
 * local time zone of whichever service parses them, so the same expiry would
 * mean different instants in different services. Calendar-invalid values such
 * as February 30th or hour 24 are rejected rather than rolled over.
 */
export function parseTimestamp(value: unknown): number {
    if (typeof value !== "string") {
        return Number.NaN;
    }

    const match = ISO_TIMESTAMP_PATTERN.exec(value);

    if (!match) {
        return Number.NaN;
    }

    const [year, month, day, hour, minute, second] = match
        .slice(1, 7)
        .map(Number) as [number, number, number, number, number, number];

    const calendar = new Date(
        Date.UTC(year, month - 1, day, hour, minute, second),
    );

    if (
        calendar.getUTCFullYear() !== year ||
        calendar.getUTCMonth() !== month - 1 ||
        calendar.getUTCDate() !== day ||
        calendar.getUTCHours() !== hour ||
        calendar.getUTCMinutes() !== minute ||
        calendar.getUTCSeconds() !== second
    ) {
        return Number.NaN;
    }

    return Date.parse(value);
}
