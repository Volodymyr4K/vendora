# ADR-003: API Schema Validation Standards

**Status:** Accepted  
**Date:** 2026-01-18  
**Deciders:** Engineering Team

## Context

The BFF currently mixes manual Zod validation (`safeParse` in route handlers) with Fastify's built-in schema validation system. This creates inconsistency and prevents automatic API documentation generation via Swagger.

## Decision

We adopt **Schema-First Validation** as the mandatory pattern for all API routes.

### Rules

1. **Mandatory Schema Declaration**
   - Every route MUST declare its contract using the `schema` property:
   ```typescript
   app.post('/checkout/init', {
     schema: {
       body: zCheckoutInitRequest,
       response: { 200: zCheckoutInitResponse }
     }
   }, async (req, reply) => {
     // req.body is guaranteed to be valid
   });
   ```

2. **No Manual Validation**
   - ❌ **Forbidden:** `const result = schema.safeParse(req.body)`
   - ✅ **Required:** Use Fastify's `validatorCompiler` (already configured globally)

3. **Error Format**
   - Validation errors MUST include field-level details:
   ```json
   {
     "error": "Validation Error",
     "message": "...",
     "details": [{ "path": "body/customer/phone", "message": "Required" }],
     "requestId": "..."
   }
   ```

4. **Documentation**
   - Swagger (`/documentation`) is the single source of truth for API contracts
   - All schemas are automatically generated from Zod definitions

## Consequences

### Positive
- **Code Clarity:** Removes 50+ lines of boilerplate validation logic
- **Type Safety:** TypeScript automatically infers `req.body` types from schema
- **Documentation:** Swagger UI auto-generates accurate API docs
- **Consistency:** Single validation pattern across all routes

### Negative
- **Migration Effort:** Existing routes need refactoring
- **Error Format Change:** Frontend may need adjustments if expecting different error structure

## Migration Strategy

1. Start with high-traffic routes (`checkout`, `cart`)
2. Verify error format compatibility with frontend
3. Gradually migrate remaining routes
4. Remove manual `safeParse` calls

## Compliance

To verify a route follows this ADR:
```bash
# ❌ BAD: Manual validation
grep -n "safeParse" apps/bff/src/domains/**/*.routes.ts

# ✅ GOOD: Schema declaration
grep -n "schema: {" apps/bff/src/domains/**/*.routes.ts
```
