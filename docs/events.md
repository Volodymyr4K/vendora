# Event Catalog

This document describes the domain events published by the BFF service via the **Vendora Event Bus** (Redis/BullMQ).

## Invariants

All events share the following identifying fields:

| Field | Type | Description |
| :--- | :--- | :--- |
| `eventId` | `UUID` | Unique identifier for the specific event instance. Consumers **should** use this for idempotency/deduplication. |
| `occurredAt` | `ISO8601` | Timestamp when the event was generated (after DB commit). |
| `eventType` | `String` | The topic/name of the event (e.g., `order.created`). |
| `tenantId` | `String` | The tenant context where the event occurred. |
| `orderId` | `String` | Correlation ID for the order lifecycle. |

## Event Types

### 1. `order.created`
**Trigger**: Successfully committed a new order in `POST /checkout/confirm`.  
**Source**: `apps/bff/src/domains/storefront/ordering/checkout.routes.ts`

**Payload**:
```json
{
  "eventId": "uuid",
  "occurredAt": "iso-date",
  "eventType": "order.created",
  "orderId": "string",
  "tenantId": "string",
  "branchSlug": "string",
  "total": 1250, // Major units (e.g. UAH)
  "currency": "UAH",
  "userId": "string (optional)"
}
```

### 2. `order.paid`
**Trigger**: Payment confirmed successfully (online callback) in `PaymentService.confirmPayment`.  
**Source**: `apps/bff/src/services/payment.ts`

**Payload**:
```json
{
  "eventId": "uuid",
  "occurredAt": "iso-date",
  "eventType": "order.paid",
  "orderId": "string",
  "tenantId": "string",
  "amount": 1250, // Major units
  "token": "string (order token)"
}
```

### 3. `order.status_updated`
**Trigger**: Admin manually updates order status in `PATCH /:branchSlug/orders/:orderId/status`.  
**Source**: `apps/bff/src/domains/admin/orders/orders.routes.ts`

**Payload**:
```json
{
  "eventId": "uuid",
  "occurredAt": "iso-date",
  "eventType": "order.status_updated",
  "orderId": "string",
  "tenantId": "string",
  "oldStatus": "unknown", // Currently not fetched for performance
  "newStatus": "string (e.g. 'cooking', 'ready')"
}
```

### 4. `order.rescheduled`
**Trigger**: Admin reschedules the order delivery time in `PATCH /:branchSlug/orders/:orderId/reschedule`.  
**Source**: `apps/bff/src/domains/admin/orders/orders.routes.ts`

**Payload**:
```json
{
  "eventId": "uuid",
  "occurredAt": "iso-date",
  "eventType": "order.rescheduled",
  "orderId": "string",
  "tenantId": "string",
  "newDeliveryTime": "iso-date",
  "newFireAt": "iso-date"
}
```

## Consumer Guidelines

1. **Idempotency**: Consumers must track `eventId` to avoid processing the same message twice.
2. **Ordering**: Timestamp `occurredAt` should be used for ordering logic, though strictly causal ordering is not guaranteed across different event types.
3. **Failures**: The publisher (BFF) logs failures but does not crash the request. Consumers should be resilient to missing events in rare failure scenarios (Edge case).
