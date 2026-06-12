# Contributing to Vendora BFF

Welcome! This guide will help you understand our architecture and contribute effectively.

## 🏗️ Architecture Overview

This BFF (Backend for Frontend) follows a **Domain-Driven Architecture**. Read [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the full picture.

**Key Principles:**
- Code organized by business domain (not technical layers)
- Strict tenant isolation (multi-tenancy)
- Schema-First API validation (Zod + Fastify)
- Observability built-in (OpenTelemetry + Prometheus)

## 📁 Project Structure

```
apps/bff/src/
├── domains/
│   ├── storefront/    # Public APIs (menu, checkout)
│   ├── admin/         # Business management (JWT + Tenant Guard)
│   ├── super-admin/   # Platform management (JWT only)
│   └── internal/      # Service-to-service (shared secret)
├── services/          # Shared business logic
├── plugins/           # Fastify plugins (auth, tenant context)
└── observability/     # Metrics, tracing
```

## 🎨 Code Standards

### TypeScript
- ✅ **Strict mode enabled** - No `any` types
- ✅ **Explicit return types** for public functions
- ✅ **Named exports** (no default exports)

```typescript
// ❌ Bad
export default function handler(req: any) { ... }

// ✅ Good
export async function createOrder(req: FastifyRequest): Promise<OrderResponse> { ... }
```

### API Routes
- ✅ **Schema-First Validation** (see [ADR-003](./docs/adr/003-api-standards.md))
- ❌ **No manual `safeParse`** in route handlers
- ✅ **Use Fastify schema property**

```typescript
// ❌ Bad
app.post('/checkout', async (req, reply) => {
  const result = zCheckoutRequest.safeParse(req.body);
  if (!result.success) return reply.code(400).send(...);
  // ...
});

// ✅ Good
app.post('/checkout', {
  schema: {
    body: zCheckoutRequest,
    response: { 200: zCheckoutResponse }
  }
}, async (req, reply) => {
  // req.body is guaranteed valid
});
```

### Observability
- ✅ **Safe Wrap Pattern** for tracing (see [ADR-002](./docs/adr/002-observability-strategy.md))
- ✅ Always use `try/finally` with spans
- ✅ Inject business metrics via `deps.metrics`

```typescript
return tracer.startActiveSpan('operation.name', async (span) => {
  try {
    span.setAttribute('tenant.id', tenantId);
    // ... business logic
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (err) {
    span.recordException(err);
    throw err;
  } finally {
    span.end();
  }
});
```

### Tenant-scoped update/delete by id
- Для моделей з `@@unique([tenantId, id])` (Order, ItemVariant, OptionGroup, OptionItem) **single-row** update/delete мають використовувати `where: { tenantId_id: { tenantId, id } }`, щоб scope гарантувався на рівні БД.
- Зразок: `option-groups.routes.ts` (OptionGroup/OptionItem — findUnique/update/delete з `tenantId_id`).

## 🔄 PR Process

### Before Creating PR
1. **Run tests**: `pnpm test`
2. **Build check**: `pnpm build`
3. **Lint**: `pnpm lint` (if available)

### PR Guidelines
- **Feature branches**: `feature/checkout-improvements`
- **Bug fixes**: `fix/tenant-resolution-edge-case`
- **Descriptive commits**: `feat(checkout): add OTP retry logic`

### Review Checklist
- [ ] Tests added/updated
- [ ] No TypeScript errors (`pnpm build`)
- [ ] Swagger updated (if API changes)
- [ ] ADR created (if architectural decision)

## 🌐 Domain Organization Rules

### Storefront Domain
**Location:** `src/domains/storefront/`  
**Access:** Public, no authentication required  
**Examples:** Menu, Branches, Checkout (guest-friendly)

### Admin Domain
**Location:** `src/domains/admin/`  
**Access:** JWT + Tenant Guard required  
**Examples:** Product management, Order updates, Settings

### Super Admin Domain
**Location:** `src/domains/super-admin/`  
**Access:** JWT only (no tenant guard)  
**Examples:** Tenant creation, Platform statistics

### Internal Domain
**Location:** `src/domains/internal/`  
**Access:** Shared secret (`INTERNAL_API_SECRET`)  
**Examples:** Tenant resolution, Health checks

## 🧪 Testing Strategy

### Unit Tests
- **Location:** `__tests__/` next to source file
- **Framework:** Vitest
- **Pattern:** Test business logic in isolation

```typescript
// src/services/payment/__tests__/payment.test.ts
describe('PaymentService', () => {
  it('should calculate correct fee', () => {
    const fee = calculateFee(1000); // 1000 cents
    expect(fee).toBe(50); // 5% = 50 cents
  });
});
```

### Integration Tests
- **Location:** `src/__tests__/integration/`
- **Pattern:** Test full request/response cycles

## 📚 Additional Resources

- [ARCHITECTURE.md](./ARCHITECTURE.md) - System design
- [ADR Index](./docs/adr/) - Architecture decisions
- [Roadmap](../../docs/perfection_roadmap.md) - Future improvements

## ❓ Questions?

- Check existing ADRs for architectural context
- Review similar code in the same domain
- Ask in team chat if stuck

---

**Thank you for contributing!** 🚀
