import { z } from "zod";

export const zUpstreamOrderStatusResponse = z.object({
    orderId: z.string(),
    status: z.string(), // Flexible validation for upstream status
});

export type UpstreamOrderStatusResponse = z.infer<typeof zUpstreamOrderStatusResponse>;
