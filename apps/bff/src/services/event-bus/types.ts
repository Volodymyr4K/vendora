export const MAIN_QUEUE_NAME = "vendora-main";

// Define the shape of all domain events here
// Define the shape of all domain events here
import type { EventSchemas } from "@vendora/contracts";
import { z } from "zod";

export type DomainEvents = {
    [K in keyof EventSchemas]: z.infer<EventSchemas[K]>
};

export type EventName = keyof DomainEvents;

export type EventHandler<K extends EventName> = (
    payload: DomainEvents[K]
) => Promise<void>;
