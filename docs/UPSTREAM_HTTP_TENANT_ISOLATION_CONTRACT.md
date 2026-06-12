# Upstream HTTP Tenant Isolation Contract

This document defines the contract that upstream HTTP services must implement for tenant isolation.

## Required Headers

### `x-tenant-slug` (Required)
- **Status**: Required
- **Format**: String, must be trimmed and non-empty
- **Behavior**: Upstream must reject requests with missing or blank (whitespace-only) `x-tenant-slug` header
- **Rejection**: Must return HTTP status `400` or `401` with a stable error code

### `x-request-id` (Optional)
- **Status**: Optional
- **Format**: String
- **Behavior**: Used for request tracing and correlation
- **Logging**: Safe to log in request logs

## Required Behavior

### Tenant Slug Validation
- Upstream MUST reject requests with missing `x-tenant-slug` header
- Upstream MUST reject requests with blank/whitespace-only `x-tenant-slug` (after trimming)
- Rejection MUST return HTTP status `400` (Bad Request) or `401` (Unauthorized)
- Rejection MUST include a stable error code in the response body

### Tenant Isolation Rule
- All tenant-scoped read operations MUST be scoped by the tenant derived from `x-tenant-slug`
- Upstream MUST NOT return data from other tenants, even if requested
- Tenant isolation MUST be enforced at the data access layer

### Logging Rule
- Upstream MUST NOT log `tenantId` or tenant-specific identifiers in logs
- Upstream MAY log `x-request-id` for request correlation
- Logs MUST be tenant-agnostic to prevent data leakage

## Example

**Valid Request:**
```
GET /branches
Headers:
  x-tenant-slug: tenant-a
  x-request-id: req-123
```

**Invalid Request (Missing Header):**
```
GET /branches
Headers:
  (no x-tenant-slug)
```
Expected: `400` or `401` with error code

**Invalid Request (Blank Header):**
```
GET /branches
Headers:
  x-tenant-slug: "   "
```
Expected: `400` or `401` with error code
