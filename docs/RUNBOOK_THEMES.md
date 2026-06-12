# Runbook: Themes per Tenant

Operational procedures for managing tenant-specific themes.

---

## 1. Update Theme

### Procedure

1. **Send PATCH request** to update theme:
   ```bash
   PATCH /super/tenants/:tenantId/theme
   Content-Type: application/json
   Authorization: Bearer <super-admin-token>
   
   # Example payloads:
   
   # Preset only:
   {
     "version": 1,
     "preset": "warm"
   }
   
   # Tokens only:
   {
     "version": 1,
     "tokens": {
       "accent": "#f2a65a"
     }
   }
   
   # Preset + token overrides:
   {
     "version": 1,
     "preset": "cool",
     "tokens": {
       "accent": "#2563eb",
       "bg": "#ffffff"
     }
   }
   ```

2. **Expected responses:**
   - `204 No Content` — theme accepted and applied
   - `400 Bad Request` — invalid `:tenantId` format or invalid theme payload
   - `404 Not Found` — tenant not found

3. **Check logs for invalidation:**
   - After successful commit, BFF logs should show `invalidateTenant(tenantId)` call
   - If missing, verify invalidate is called **after** commit, not inside transaction
   - Look for cache-manager invalidation entries

4. **Verify result:**
   - Proceed to section 2 (Verify Invalidation) below

---

## 2. Verify Invalidation

### Procedure

1. **Send GET request** to the **same tenant**:
   ```bash
   GET /config
   x-tenant-slug: <tenant-slug>
   # OR use custom domain / subdomain that resolves to this tenant
   ```

2. **Check theme in response:**
   - Verify `theme.tokens.accent` (or other changed field) has the **new** value
   - Example: if PATCH set `accent: "#f2a65a"`, response must show `"accent": "#f2a65a"`

3. **Alternative: Storefront verification:**
   - Open storefront page for this tenant
   - Check computed CSS variable:
     ```javascript
     getComputedStyle(document.documentElement).getPropertyValue('--accent')
     // Should return new color value
     ```

### Diagnosis if old value persists

If you see the **old** theme value after PATCH:

#### a) Check Cache-Control headers
- BFF response must have `Cache-Control: no-store`
- Next.js fetch must use `cache: "no-store"`

#### b) Check Next.js cache
- Ensure all `/config` and `/branches` fetches use the **helper** from `lib/data.ts`
- No "naked" `fetch()` calls without `no-store`

#### c) Check domain cache (L1)
- If custom domain was changed, verify both `invalidateDomain(oldDomain)` and `invalidateDomain(newDomain)` were called

---

## 3. Diagnose Fallback Version

If theme in response is **default** instead of expected custom theme:

### Procedure

1. **Check BFF server logs** for:
   - `tenantId`: which tenant triggered fallback
   - `reason`: one of `unknown_version | invalid_shape | invalid_value`
   - `rawVersion`: the version value found in DB
   - `x-request-id`: request identifier for tracing

2. **Check database** `Tenant.settings.theme`:
   ```sql
   SELECT settings->'theme' FROM "Tenant" WHERE id = '<tenantId>';
   ```
   - Verify `version === 1`
   - Verify structure matches `ThemeV1` schema

3. **Common issues:**
   - `version` field missing or not `1`
   - Invalid hex color format (missing `#`, non-hex characters)
   - Unknown keys in `tokens` object
   - Invalid `preset` value (not in allowlist: default, warm, cool, minimal)

---

## 4. Invalidation Table (Domain Operations)

| Operation      | Invalidate calls                                                          |
|----------------|---------------------------------------------------------------------------|
| **Add domain** | `invalidateDomain(newDomain)` + `invalidateTenant(tenantId)`              |
| **Change domain** | `invalidateDomain(oldDomain)` + `invalidateDomain(newDomain)` + `invalidateTenant(tenantId)` |
| **Remove domain** | `invalidateDomain(oldDomain)` + `invalidateTenant(tenantId)`              |

### Notes
- `invalidateTenant` clears **BFF L2 cache only** (tenant resolver cache)
- **V1 = no-store only**; tags (`revalidateTag`) are **forbidden** until V2
- Don't expect `invalidateTenant` to "clear everything" — only BFF tenant cache

---

## 5. Brand URL Policy and Validation

### Policy A: No Server-Side Fetch (V1)

**Rule:** BFF and Web **must not** fetch brand URLs server-side.

**Implementation:**
- Use `<img>` tags directly
- Use `next/image` with `unoptimized` prop
- No server-side image optimization or fetching

### Validation Rules (Implemented in `validateBrandUrls`)

Brand URLs (`logoUrl`, `faviconUrl`, `fontUrl`, `ogImage`) must satisfy:

1. **HTTPS only** — `protocol === "https:"`
2. **No IP addresses** — host cannot be IPv4, IPv6, or IPv4-mapped IPv6
3. **No numeric hostnames** — e.g., `2130706433` (decimal IP notation)
4. **No empty hostname** — after normalization (e.g., `https://./`)
5. **No localhost** — including trailing dot (`localhost.`)
6. **No `.local` domains** — including `foo.local.`
7. **No userinfo** — username/password forbidden (prevents obfuscation like `https://example.com@localhost/`)
8. **Max URL length: 2048 characters** (enforced in contracts)

### What is NOT blocked

- `.lan`, `.home`, `.internal`, `localdomain` — these are **allowed** (can be extended if needed)

### Validation Type

- **Syntax validation only** — no DNS resolution
- Hosts that resolve to private IPs are not checked
- Security relies on **Policy A** (no server-side fetch)

### Response on Validation Failure

- PATCH with invalid brand URL → `400 invalid_payload` (V1 strict mode)
- No sanitize/drop for individual brand fields

---

## 6. Guardrails (Automated Checks)

These rules are enforced automatically via `pnpm guardrails:themes`:

### Web Guardrails
1. **Fetch allowlist:** `/config` and `/branches/` fetches only in `apps/web/lib/data.ts`
2. **No tags/revalidate:** No `next: { tags }` or `revalidateTag` for `/config` and `/branches` endpoints
3. **Server-only enforcement:** `themeToCssVars` only in `lib/theme/server.ts` with `import "server-only"`; no client imports

### BFF Guardrails
4. **No direct tenant reads:** No `prisma.tenant` in GET `/config` and GET `/branches/:branch` route handlers

### What to do if guardrails fail
- Check error message for specific violation
- Fix the code to comply with the rule
- If rule seems incorrect, discuss in team before disabling
