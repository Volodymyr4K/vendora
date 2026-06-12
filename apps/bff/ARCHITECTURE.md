# 🏗️ BFF Architecture & Engineering Standards

> **Status:** Active
> **Last Updated:** Jan 2026
> **Scope:** Backend-for-Frontend (BFF)

This document defines the architectural "Constitution" of the Vendora BFF. It serves as the single source of truth for code organization, security layers, and dependency rules.

---

## 1. Domain-Driven Design (DDD)

We organize code by **Business Domain**, not by technical layer (e.g., we do NOT use `controllers/`, `models/` folders).

### 📂 Directory Structure (`src/domains/`)
Each directory represents a bounded context.

| Domain | Description | Access Level |
|--------|-------------|--------------|
| `storefront/` | Public-facing customer API (Menu, Cart, Checkout) | Public / Customer JWT |
| `admin/` | Tenant management dashboard (Product, Orders, Settings) | Tenant Admin JWT |
| `super-admin/` | Platform owner tools (Create Tenants, Global Config) | Super Admin JWT |
| `auth/` | Authentication flows (Login, OTP, Refresh) | Public |
| `infra/` | Observability & Health (Health, Metrics) | Public (Internal Network) |
| `internal/` | Inter-service communication (webhooks, callbacks) | Shared Secret |

### 🚫 Dependency Rules
1.  **No Horizontal Imports:** A domain should never import directly from another domain (e.g., `storefront` cannot import `admin`).
    *   *Exception:* Shared Types or Contracts (defined in `@vendora/contracts`).
2.  **Service Layer:** Shared logic (Payment, Event Bus, Cache) lives in `src/services/` and can be injected into any domain.
3.  **Utils:** Pure helper functions live in `src/utils/` (no side effects).

---

## 2. Security Layers (The "Onion" Model)

Security is applied in concentric layers. `src/index.ts` enforces this order.

| Layer | Component | Guard / Plugin | Description |
|-------|-----------|----------------|-------------|
| **1** | **Infra** | `helmet`, `cors`, `rateLimit` | DDoS protection, Headers, Sanitization. |
| **2** | **Public** | *None* | Open routes (Menu, Delivery Info, Auth Init). |
| **3** | **Customer** | `authPlugin({ role: 'customer' })` | Customer Profile, Orders. Requires valid JWT. |
| **4** | **Super Admin** | `authPlugin({ role: 'super-admin' })` | Platform management. Skips Tenant checks. |
| **5** | **Tenant Admin** | `tenantGuardPlugin` + `authPlugin` | **High Security.** Requires JWT AND Active Tenant Context. |
| **6** | **Internal** | Shared Secret / IP Whitelist | For Next.js Middleware or Webhooks only. |

### 🔐 Critical Rule: Tenant Isolation
*   **Layer 5 (Tenant Admin)** MUST always use `validateTenant(req)`.
*   All Database queries inside Layer 5 MUST include `where: { tenantId: tenant.id }`.
*   **NEVER** use `tenantId` from the request body or URL without validating it matches the authenticated session/header.

---

## 3. Observability Standard

We use a "Safe Wrap" pattern for observability to prevent monitoring code from crashing business logic.

### Tracing (OpenTelemetry)
*   **Entry Point:** `src/instrumentation.ts` (Loaded via `--import`).
*   **Usage:**
    ```typescript
    // ✅ CORRECT: Try/Finally guarantees span closure
    return tracer.startActiveSpan('operation_name', async (span) => {
      try {
        // Business Logic
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (err) {
        span.recordException(err);
        span.setStatus({ code: SpanStatusCode.ERROR });
        throw err;
      } finally {
        span.end(); 
      }
    });
    ```

---

## 4. Key Technologies
*   **Framework:** Fastify (Lightweight, High Performance)
*   **Validation:** Zod (Runtime type guarantees)
*   **ORM:** Prisma (Type-safe DB access)
*   **Events:** BullMQ + Redis (Async processing)
*   **Tracing:** OpenTelemetry (Distributed tracing)
