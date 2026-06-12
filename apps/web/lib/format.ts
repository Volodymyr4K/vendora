export function formatPrice(amount: number, alreadyInUnits = false): string {
    if (typeof amount !== 'number') return "0";
    // If already in units (e.g. from admin API), don't divide again
    const value = alreadyInUnits ? amount : amount / 100;
    const isWhole = value % 1 === 0;
    return value.toLocaleString('uk-UA', {
        minimumFractionDigits: isWhole ? 0 : 2,
        maximumFractionDigits: 2
    });
}

/**
 * Format today's working hours from workingSchedule (SSOT).
 * Returns first interval for today in format "10:00 - 22:00".
 * Falls back to "Графік" if schedule is missing or invalid.
 */
export function formatTodayHours(workingSchedule?: { mon?: Array<{ start: string; end: string }>; tue?: Array<{ start: string; end: string }>; wed?: Array<{ start: string; end: string }>; thu?: Array<{ start: string; end: string }>; fri?: Array<{ start: string; end: string }>; sat?: Array<{ start: string; end: string }>; sun?: Array<{ start: string; end: string }>; overrides?: Record<string, Array<{ start: string; end: string }> | null> } | null): string {
    if (!workingSchedule) return "Графік";

    const today = new Date();
    const dateIsoParts = today.toISOString().split('T');
    const dateIso = dateIsoParts[0];
    const dayOfWeek = today.getDay();

    // Check for date-specific override first
    if (dateIso && workingSchedule.overrides && dateIso in workingSchedule.overrides) {
        const override = workingSchedule.overrides[dateIso];
        if (override && override.length > 0) {
            const first = override[0];
            if (first) {
                return `${first.start} - ${first.end}`;
            }
        }
        return "Графік";
    }

    // Map day of week to schedule key (0=Sunday, 1=Monday, etc.)
    const dayKeys: Record<number, 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'> = {
        0: 'sun',
        1: 'mon',
        2: 'tue',
        3: 'wed',
        4: 'thu',
        5: 'fri',
        6: 'sat',
    };

    const dayKey = dayKeys[dayOfWeek];
    if (!dayKey) return "Графік";

    const intervals = workingSchedule[dayKey];
    if (!intervals || !Array.isArray(intervals) || intervals.length === 0) return "Графік";

    const first = intervals[0];
    if (!first) return "Графік";
    return `${first.start} - ${first.end}`;
}
