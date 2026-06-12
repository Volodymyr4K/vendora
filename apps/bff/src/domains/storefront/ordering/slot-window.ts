import { DateTime } from 'luxon';

/**
 * Compute slot window boundaries matching /time-slots generation semantics exactly.
 * 
 * @param now - Current DateTime in branch effective timezone
 * @param minAdvanceMinutes - Minimum advance time in minutes
 * @returns Object with start and end DateTime boundaries for slot generation
 */
export function computeSlotWindow(now: DateTime, minAdvanceMinutes: number): { start: DateTime; end: DateTime } {
    // Calculate earliest allowed time: now + minAdvanceMinutes
    const minTime = now.plus({ minutes: minAdvanceMinutes });

    // Round UP to nearest 30 minutes
    // Example: 14:15 -> 14:30, 14:31 -> 15:00, 14:45 -> 15:00
    const startMinute = Math.ceil(minTime.minute / 30) * 30;
    const hourCarry = Math.floor(startMinute / 60);
    const minuteInHour = startMinute % 60;
    let start = minTime.startOf("hour").plus({ hours: hourCarry, minutes: minuteInHour });

    // If truncation of seconds/millis made start earlier than minTime, bump to next slot boundary
    if (start < minTime) {
        start = start.plus({ minutes: 30 });
    }

    // Calculate latest allowed time (end of tomorrow)
    const end = now.plus({ days: 1 }).endOf('day');

    return { start, end };
}
