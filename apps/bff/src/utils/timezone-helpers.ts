/**
 * Timezone utility functions for multi-tenant system
 * Uses Luxon for robust timezone handling
 * 
 * Supports:
 * - IANA timezone identifiers (e.g., "Europe/Kiev", "America/New_York")
 * - Automatic DST (Daylight Saving Time) handling
 * - Timezone inheritance (branch → tenant)
 */

import { DateTime } from 'luxon';

/**
 * Get effective timezone for a branch
 * 
 * Implements inheritance logic: branch timezone overrides tenant default
 * 
 * @param branchTimezone - Branch-specific timezone (can be null)
 * @param tenantTimezone - Tenant default timezone
 * @returns Effective IANA timezone identifier
 * 
 * @example
 * getEffectiveTimezone(null, "Europe/Kiev") // "Europe/Kiev" (inherited)
 * getEffectiveTimezone("America/New_York", "Europe/Kiev") // "America/New_York" (override)
 */
export function getEffectiveTimezone(
    branchTimezone: string | null | undefined,
    tenantTimezone: string
): string {
    return branchTimezone || tenantTimezone;
}

/**
 * Convert UTC datetime to branch local time
 * 
 * @param utcDate - UTC datetime
 * @param timezone - IANA timezone identifier
 * @returns DateTime object in branch timezone
 * 
 * @example
 * const localTime = toLocalTime(new Date("2026-01-20T19:00:00Z"), "America/New_York");
 * console.log(localTime.toFormat('HH:mm')); // "14:00" (7 PM UTC = 2 PM EST)
 */
export function toLocalTime(utcDate: Date, timezone: string): DateTime {
    return DateTime.fromJSDate(utcDate, { zone: 'utc' }).setZone(timezone);
}

/**
 * Convert local time to UTC
 * 
 * @param localDate - Local datetime in specific timezone
 * @param timezone - IANA timezone identifier
 * @returns DateTime object in UTC
 * 
 * @example
 * const utcTime = toUTC(new Date("2026-01-20T14:00:00"), "America/New_York");
 * console.log(utcTime.toISO()); // "2026-01-20T19:00:00.000Z"
 */
export function toUTC(localDate: Date, timezone: string): DateTime {
    return DateTime.fromJSDate(localDate, { zone: timezone }).toUTC();
}

/**
 * Format datetime in branch timezone
 * 
 * @param date - Date object (UTC or any timezone)
 * @param timezone - IANA timezone identifier
 * @param format - Luxon format string (default: "yyyy-MM-dd HH:mm:ss")
 * @returns Formatted datetime string in branch timezone
 * 
 * @example
 * formatInTimezone(
 *   new Date("2026-01-20T19:00:00Z"),
 *   "America/New_York",
 *   "MMM dd, h:mm a"
 * ); // "Jan 20, 2:00 PM"
 */
export function formatInTimezone(
    date: Date,
    timezone: string,
    format: string = "yyyy-MM-dd HH:mm:ss"
): string {
    const dt = DateTime.fromJSDate(date, { zone: 'utc' }).setZone(timezone);
    return dt.toFormat(format);
}

/**
 * Get current time in branch timezone
 * 
 * @param timezone - IANA timezone identifier
 * @returns Current DateTime in branch timezone
 * 
 * @example
 * const nowInKyiv = getCurrentTimeInTimezone("Europe/Kiev");
 * console.log(nowInKyiv.toFormat("HH:mm")); // "20:05"
 */
export function getCurrentTimeInTimezone(timezone: string): DateTime {
    return DateTime.now().setZone(timezone);
}

/**
 * Validates if the given datetime falls within the advanced WorkingSchedule.
 * 
 * Logic:
 * 1. Checks overrides for the specific date (ISO format).
 *    - If present (array), uses this custom schedule (ignoring base schedule).
 *    - If present (null), returns false (day off).
 *    - If absent, falls back to base weekly schedule (mon..sun).
 * 2. Handles overnight shifts from THE PREVIOUS DAY (only if today has NO overrides).
 *    - Checks yesterday's schedule (base or override).
 *    - If any interval yesterday was overnight (end <= start), checks if current time falls in the morning spillover.
 * 
 * @param opts.schedule - The WorkingSchedule object (weekly + overrides)
 * @param opts.current  - The DateTime to validate (already set to correct timezone)
 */
import type { WorkingSchedule, DaySchedule } from '@vendora/contracts';

export function isWithinWorkingScheduleForDateTime(opts: {
    schedule: WorkingSchedule;
    current: DateTime;
}): boolean {
    const { schedule, current } = opts;

    // ---------------------------------------------------------
    // 1. Prepare Key Dates & Times
    // ---------------------------------------------------------
    const todayIso = current.toISODate(); // "YYYY-MM-DD"
    if (!todayIso) return false;

    // Current time in minutes from midnight (0..1439)
    const tMinutes = current.hour * 60 + current.minute;

    // Weekday mapping: Luxon 1=Mon ... 7=Sun
    const dayKeys: Record<number, keyof WorkingSchedule> = {
        1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri', 6: 'sat', 7: 'sun'
    };
    const todayKey = dayKeys[current.weekday];
    if (!todayKey) return false;

    // ---------------------------------------------------------
    // 2. Determine Today's Schedule
    // ---------------------------------------------------------
    let todaySchedule: DaySchedule | undefined | null;
    let hasTodayOverride = false;

    // Check overrides first
    if (schedule.overrides && todayIso in schedule.overrides) {
        todaySchedule = schedule.overrides[todayIso];
        hasTodayOverride = true; // Flag to prevent yesterday carryover check
    } else {
        // Fallback to base weekly schedule
        todaySchedule = schedule[todayKey] as DaySchedule;
    }

    // If schedule is explicitly null (day off override), return false immediately
    // If undefined/empty, treat as closed (but we might still need to check yesterday carryover if NO override existed)

    // ---------------------------------------------------------
    // 3. Check Today's Intervals
    // ---------------------------------------------------------
    if (todaySchedule && Array.isArray(todaySchedule)) {
        for (const interval of todaySchedule) {
            const [sHour, sMin] = interval.start.split(':').map(Number);
            const [eHour, eMin] = interval.end.split(':').map(Number);
            const startMins = (sHour || 0) * 60 + (sMin || 0);
            const endMins = (eHour || 0) * 60 + (eMin || 0);

            // Normal interval: 09:00 - 18:00
            if (endMins > startMins) {
                if (tMinutes >= startMins && tMinutes < endMins) return true;
            }
            // Overnight interval: 18:00 - 02:00
            // For "today's" schedule, this means we are in the evening porton (18:00..23:59)
            else {
                if (tMinutes >= startMins) return true;
            }
        }
    }

    // ---------------------------------------------------------
    // 4. Check Yesterday's Carryover (Overnight Shifts)
    // ---------------------------------------------------------
    // Logic Rule: "if today override exists, DO NOT allow yesterday carryover"
    if (hasTodayOverride) {
        return false;
    }

    const yesterday = current.minus({ days: 1 });
    const ydayIso = yesterday.toISODate();
    if (!ydayIso) return false;

    const ydayKey = dayKeys[yesterday.weekday];
    if (!ydayKey) return false; // Should not happen

    let yesterdaySchedule: DaySchedule | undefined | null;

    // Determine yesterday's schedule (override vs base)
    if (schedule.overrides && ydayIso in schedule.overrides) {
        yesterdaySchedule = schedule.overrides[ydayIso];
    } else {
        yesterdaySchedule = schedule[ydayKey] as DaySchedule;
    }

    if (yesterdaySchedule && Array.isArray(yesterdaySchedule)) {
        for (const interval of yesterdaySchedule) {
            const [sHour, sMin] = interval.start.split(':').map(Number);
            const [eHour, eMin] = interval.end.split(':').map(Number);
            const startMins = (sHour || 0) * 60 + (sMin || 0);
            const endMins = (eHour || 0) * 60 + (eMin || 0);

            // We only care about OVERNIGHT intervals from yesterday (end <= start)
            // e.g. 22:00 - 04:00.
            // We need to check if current time is in the morning portion (00:00..04:00)
            if (endMins <= startMins) {
                if (tMinutes < endMins) return true;
            }
        }
    }

    return false;
}
