import { z } from 'zod';

// Time Slots Schemas
export const zTimeSlot = z.object({
    value: z.string().datetime({ offset: true }), // ISO datetime string (offsets allowed)
    label: z.string(), // Display label: "Today 14:30", "Tomorrow 10:00"
    isAvailable: z.boolean(), // Is this slot within working hours?
});

export const zTimeSlotsResponse = z.object({
    slots: z.array(zTimeSlot),
    timezone: z.string(), // IANA timezone identifier
    isScheduledOrderingEnabled: z.boolean(),
});

export type TimeSlot = z.infer<typeof zTimeSlot>;
export type TimeSlotsResponse = z.infer<typeof zTimeSlotsResponse>;
