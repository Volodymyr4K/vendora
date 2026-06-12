import { DateTime } from 'luxon';
import { getEffectiveTimezone, isWithinWorkingScheduleForDateTime } from '../../../utils/timezone-helpers.js';
import { zWorkingSchedule, type WorkingSchedule, type DaySchedule } from '@vendora/contracts';
import { computeSlotWindow } from './slot-window.js';

export type TimeValidationResult =
    | { valid: true }
    | { valid: false; error: "INVALID_DATE"; message: string }
    | { valid: false; error: "INSUFFICIENT_ADVANCE_TIME"; message: string }
    | { valid: false; error: "TOO_FAR_IN_FUTURE"; message: string }
    | { valid: false; error: "OUTSIDE_BUSINESS_HOURS"; message: string }
    | { valid: false; error: "SLOT_FULL"; message: string }
    | { valid: false; error: "INVALID_DELIVERY_TIME"; message: string };

function formatHoursForDate(schedule: WorkingSchedule, current: DateTime): string {
    const dateIso = current.toISODate();
    if (!dateIso) return "Closed";

    // weekday: 1=Mon ... 7=Sun
    type DayKey = Exclude<keyof WorkingSchedule, "overrides">;
    const dayKeys: Record<number, DayKey> = {
        1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri', 6: 'sat', 7: 'sun'
    };
    const dayKey = dayKeys[current.weekday];
    if (!dayKey) return "Closed";

    // 1) Check for override for specific date
    if (schedule.overrides && dateIso in schedule.overrides) {
        const override = schedule.overrides[dateIso];
        if (!override || !Array.isArray(override) || override.length === 0) {
            return "Зачинено сьогодні (виняток)";
        }
        return override.map(i => `${i.start} - ${i.end}`).join(', ');
    }

    // 2) Check regular schedule
    const intervals: DaySchedule | undefined | null = schedule[dayKey];
    if (!intervals || !Array.isArray(intervals) || intervals.length === 0) {
        return "Зачинено сьогодні";
    }

    return intervals.map(i => `${i.start} - ${i.end}`).join(', ');
}

function findNextOpening(schedule: WorkingSchedule, from: DateTime): DateTime | null {
    // weekday: 1=Mon ... 7=Sun
    type DayKey = Exclude<keyof WorkingSchedule, "overrides">;
    const dayKeys: Record<number, DayKey> = {
        1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri', 6: 'sat', 7: 'sun'
    };

    for (let dayOffset = 0; dayOffset <= 14; dayOffset++) {
        const candidateDay = from.plus({ days: dayOffset }).startOf("day");
        const dateIso = candidateDay.toISODate();
        if (!dateIso) continue;

        let intervals: DaySchedule | undefined | null = null;

        // 1) Check for override for specific date
        if (schedule.overrides && dateIso in schedule.overrides) {
            intervals = schedule.overrides[dateIso];
            // If null/empty -> CLOSED (continue)
        } else {
            // 2) Regular schedule
            const dayKey = dayKeys[candidateDay.weekday];
            if (dayKey) {
                intervals = schedule[dayKey];
            }
        }

        if (!intervals || !Array.isArray(intervals) || intervals.length === 0) {
            continue;
        }

        let earliestInDay: DateTime | null = null;

        for (const interval of intervals) {
            const [h, m] = interval.start.split(':').map(Number);
            const opening = candidateDay.set({ hour: h, minute: m, second: 0, millisecond: 0 });

            if (dayOffset === 0) {
                if (opening > from) {
                    if (!earliestInDay || opening < earliestInDay) {
                        earliestInDay = opening;
                    }
                }
            } else {
                if (!earliestInDay || opening < earliestInDay) {
                    earliestInDay = opening;
                }
            }
        }

        if (earliestInDay) {
            return earliestInDay;
        }
    }
    return null;
}

function formatNextOpening(dt: DateTime): string {
    return dt.toFormat("dd.LL.yyyy HH:mm");
}

export function validateDeliveryTime(
    requestedTimeIso: string | null | undefined,
    branch: {
        timezone?: string | null;
        minAdvanceMinutes: number;
        workingSchedule?: unknown; // Allow passing Prisma Json value
        tenant: { timezone: string };
    }
): TimeValidationResult {
    if (!requestedTimeIso) {
        return { valid: true }; // Optional field, so empty is valid (ASAP order handled elsewhere or disallowed)
    }

    const timezone = getEffectiveTimezone(branch.timezone, branch.tenant.timezone);
    const reqDt = DateTime.fromISO(requestedTimeIso, { zone: timezone });
    const now = DateTime.now().setZone(timezone);

    if (!reqDt.isValid) {
        return { valid: false, error: "INVALID_DATE", message: "Невірний формат дати" };
    }

    // 0. Slot Membership Validation (must match /time-slots generation exactly)
    const { start, end } = computeSlotWindow(now, branch.minAdvanceMinutes);
    
    // a) Seconds and milliseconds must be 0
    if (reqDt.second !== 0 || reqDt.millisecond !== 0) {
        return {
            valid: false,
            error: "INVALID_DELIVERY_TIME",
            message: "Обраний час недоступний. Оберіть час зі списку слотів."
        };
    }
    
    // b) Minute must be exactly 0 or 30
    if (reqDt.minute !== 0 && reqDt.minute !== 30) {
        return {
            valid: false,
            error: "INVALID_DELIVERY_TIME",
            message: "Обраний час недоступний. Оберіть час зі списку слотів."
        };
    }
    
    // c) Must be within slot window
    if (reqDt < start || reqDt > end) {
        return {
            valid: false,
            error: "INVALID_DELIVERY_TIME",
            message: "Обраний час недоступний. Оберіть час зі списку слотів."
        };
    }

    // 1. Min Advance Time (Cooldown)
    const minAllowedTime = now.plus({ minutes: branch.minAdvanceMinutes });
    // Allow a small grace period (e.g., 1 minute) for network latency? No, strict for now.
    // Actually, "now" is when the server processes it.
    if (reqDt < minAllowedTime) {
        return {
            valid: false,
            error: "INSUFFICIENT_ADVANCE_TIME",
            message: `Замовлення на певний час потрібно робити мінімум за ${branch.minAdvanceMinutes} хв.`
        };
    }

    // 2. Max Future limit (End of Tomorrow in Branch Timezone)
    const endOfTomorrow = now.plus({ days: 1 }).endOf('day');
    if (reqDt > endOfTomorrow) {
        return {
            valid: false,
            error: "TOO_FAR_IN_FUTURE",
            message: "Можна замовити тільки на сьогодні або завтра."
        };
    }

    // 3. Working Hours
    // 3. Working Hours
    // Compute workingSchedule once
    const workingSchedule = branch.workingSchedule == null
        ? undefined
        : zWorkingSchedule.parse(branch.workingSchedule);

    let isOpen = false;

    if (workingSchedule) {
        // New Logic: Use Weekly Schedule Logic
        isOpen = isWithinWorkingScheduleForDateTime({
            schedule: workingSchedule,
            current: reqDt
        });
    } else {
        // No schedule = Closed
        isOpen = false;
    }

    if (!isOpen) {
        const displayHours = workingSchedule
            ? formatHoursForDate(workingSchedule, reqDt)
            : 'Графік роботи не налаштовано';

        let message = `Обраний час поза робочими годинами (${displayHours})`;
        if (workingSchedule) {
            const nextOpen = findNextOpening(workingSchedule, reqDt);
            if (nextOpen) {
                message += ` Наступне відкриття: ${formatNextOpening(nextOpen)}`;
            }
        }

        return {
            valid: false,
            error: "OUTSIDE_BUSINESS_HOURS",
            message
        };
    }

    return { valid: true };
}

export function validateASAP(branch: {
    timezone?: string | null;
    workingSchedule?: unknown; // Allow passing Prisma Json value
    tenant: { timezone: string };
}): TimeValidationResult {
    const timezone = getEffectiveTimezone(branch.timezone, branch.tenant.timezone);
    const now = DateTime.now().setZone(timezone);

    // Compute workingSchedule once
    const workingSchedule = branch.workingSchedule == null
        ? undefined
        : zWorkingSchedule.parse(branch.workingSchedule);

    let isOpen = false;

    if (workingSchedule) {
        // New Logic: Use Weekly Schedule Logic
        isOpen = isWithinWorkingScheduleForDateTime({
            schedule: workingSchedule,
            current: now
        });
    } else {
        // No schedule = Closed
        isOpen = false;
    }

    if (!isOpen) {
        const displayHours = workingSchedule
            ? formatHoursForDate(workingSchedule, now)
            : 'Графік роботи не налаштовано';

        let message = `Заклад зараз зачинений. Робочі години: ${displayHours}`;
        if (workingSchedule) {
            const nextOpen = findNextOpening(workingSchedule, now);
            if (nextOpen) {
                message += ` Наступне відкриття: ${formatNextOpening(nextOpen)}`;
            }
        }

        return {
            valid: false,
            error: "OUTSIDE_BUSINESS_HOURS",
            message
        };
    }

    return { valid: true };
}

export async function validateSlotCapacity(
    branch: {
        slug: string;
        tenantId: string;
        slotCapacity: number; // Added in Schema
        timezone?: string | null;
        tenant: { timezone: string };
    },
    requestedDeliveryTime: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prisma: any // Pass Prisma client instance
): Promise<TimeValidationResult> {
    const { getEffectiveTimezone } = await import('../../../utils/timezone-helpers.js');
    const { DateTime } = await import('luxon');

    const timezone = getEffectiveTimezone(branch.timezone, branch.tenant.timezone);
    const reqTime = DateTime.fromISO(requestedDeliveryTime, { zone: timezone });

    // Define Slot Window: Exact match? Or +/- 1 minute?
    // Since we generate slots exactly (e.g. 14:00:00), exact match is preferred 
    // BUT frontend might send milliseconds/seconds diffs.
    // Let's assume strict 30-min slots and frontend sends valid ISO.
    // To be safe, we can match strict equality on ISO string if we normalized it, 
    // or use a small range. Let's use exact match on the "minute" level.

    // Count active orders for this slot
    // Active = NOT (cancelled OR rejected)
    const count = await prisma.order.count({
        where: {
            branchSlug: branch.slug,
            tenantId: branch.tenantId,
            status: { notIn: ['cancelled', 'rejected'] },
            // Strict Time Match
            requestedDeliveryTime: reqTime.toJSDate()
        }
    });

    if (count >= branch.slotCapacity) {
        return {
            valid: false,
            error: "SLOT_FULL",
            message: "На жаль, на цей час вже забагато замовлень. Будь ласка, оберіть інший час."
        };
    }

    return { valid: true };
}
