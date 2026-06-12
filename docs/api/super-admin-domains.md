# Super Admin - Custom Domains API

API endpoints for managing custom domains. Requires Super Admin authentication.

---

## Authentication

All endpoints require Super Admin JWT token:

```http
Authorization: Bearer <super_admin_jwt_token>
```

**Scopes required:** `super-admin`

---

## Endpoints

### List Tenant Domains

Get all custom domains for a tenant.

```http
GET /super/tenants/:tenantId/domains
```

**Parameters:**
- `tenantId` (path) - UUID of tenant

**Response:** `200 OK`

```json
[
  {
    "id": "domain-uuid",
    "domain": "example.com",
    "status": "verified",
    "isPrimary": true,
    "txtRecord": "vendora-verify=abc123...",
    "cnameTarget": "cname.vendora-platform.com",
    "createdAt": "2026-01-11T10:00:00Z",
    "verifiedAt": "2026-01-11T10:15:00Z",
    "lastVerifiedAt": "2026-01-12T09:00:00Z",
    "gracePeriodStartedAt": null
  },
  {
    "id": "domain-uuid-2",
    "domain": "www.example.com",
    "status": "pending",
    "isPrimary": false,
    "txtRecord": "vendora-verify=def456...",
    "cnameTarget": "cname.vendora-platform.com",
    "createdAt": "2026-01-12T08:00:00Z",
    "verifiedAt": null,
    "lastVerifiedAt": null,
    "gracePeriodStartedAt": null
  }
]
```

**Status values:**
- `pending` - Awaiting DNS configuration/verification
- `verified` - DNS verified and active
- `failed` - Verification failed (after grace period)

---

### Add Custom Domain

Create a new custom domain for tenant.

```http
POST /super/tenants/:tenantId/domains
```

**Request Body:**

```json
{
  "domain": "myrestaurant.com",
  "isPrimary": true
}
```

**Fields:**
- `domain` (string, required) - Domain name (validates format)
- `isPrimary` (boolean, optional) - Set as primary domain (default: false)

**Response:** `200 OK`

```json
{
  "id": "new-domain-uuid",
  "domain": "myrestaurant.com",
  "status": "pending",
  "isPrimary": true,
  "txtRecord": "vendora-verify=generatedtoken123",
  "cnameTarget": "cname.vendora-platform.com",
  "createdAt": "2026-01-12T10:00:00Z"
}
```

**Errors:**

`400 Bad Request` - Invalid domain format
```json
{
  "error": "Invalid domain format"
}
```

`409 Conflict` - Domain already exists
```json
{
  "error": "Domain already exists"
}
```

---

### Verify Domain

Trigger DNS verification for a domain.

```http
POST /super/tenants/:tenantId/domains/:domainId/verify
```

**Parameters:**
- `tenantId` (path) - Tenant UUID
- `domainId` (path) - Domain UUID

**Response:** `200 OK`

```json
{
  "verified": true,
  "checks": {
    "txtRecord": true,
    "cnameRecord": true
  }
}
```

**Errors:**

`400 Bad Request` - DNS verification failed
```json
{
  "verified": false,
  "checks": {
    "txtRecord": false,
    "cnameRecord": true
  },
  "error": "TXT record not found"
}
```

`404 Not Found` - Domain not found
```json
{
  "error": "Domain not found"
}
```

---

### Delete Domain

Remove a custom domain from tenant.

```http
DELETE /super/tenants/:tenantId/domains/:domainId
```

**Parameters:**
- `tenantId` (path) - Tenant UUID
- `domainId` (path) - Domain UUID

**Response:** `204 No Content`

**Errors:**

`400 Bad Request` - Cannot delete primary domain
```json
{
  "error": "Cannot delete primary domain. Set another domain as primary first."
}
```

`404 Not Found` - Domain not found
```json
{
  "error": "Domain not found"
}
```

---

### Set Primary Domain

Mark a domain as the primary domain for tenant.

```http
PATCH /super/tenants/:tenantId/domains/:domainId
```

**Request Body:**

```json
{
  "isPrimary": true
}
```

**Response:** `200 OK`

```json
{
  "id": "domain-uuid",
  "domain": "example.com",
  "isPrimary": true
}
```

**Note:** Setting a domain as primary automatically unsets the previous primary domain.

**Errors:**

`400 Bad Request` - Domain not verified
```json
{
  "error": "Cannot set unverified domain as primary"
}
```

---

## Domain Status Lifecycle

```
┌─────────┐
│ PENDING │ ──verify──> ┌──────────┐
└─────────┘             │ VERIFIED │
     ↑                  └──────────┘
     │                       │
     │                       │ DNS check fails
     │                       ↓
     │                  ┌──────────┐
     │                  │ PENDING  │
     │                  │ (grace)  │
     │                  └──────────┘
     │                       │
     │                       │ 7 days pass
     │                       ↓
     │                  ┌─────────┐
     └───retry verify── │ FAILED  │
                        └─────────┘
```

**States:**
1. **PENDING** - Initial state, awaiting DNS config
2. **VERIFIED** - DNS verified, domain active
3. **PENDING (grace)** - DNS check failed, 7-day grace period
4. **FAILED** - Grace period expired, domain disabled

---

## Rate Limits

- **Verification attempts:** 5 per minute per domain
- **Domain creation:** 10 per hour per tenant

---

## Webhooks (Future)

Coming soon: Webhook notifications for domain status changes.

---

## Code Examples

### cURL - Add Domain

```bash
curl -X POST https://api.vendora.com/super/tenants/TENANT_ID/domains \
  -H "Authorization: Bearer YOUR_SUPER_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "domain": "myrestaurant.com",
    "isPrimary": true
  }'
```

### cURL - Verify Domain

```bash
curl -X POST https://api.vendora.com/super/tenants/TENANT_ID/domains/DOMAIN_ID/verify \
  -H "Authorization: Bearer YOUR_SUPER_ADMIN_TOKEN"
```

### JavaScript - Fetch API

```javascript
const response = await fetch(`/super/tenants/${tenantId}/domains`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    domain: 'myrestaurant.com',
    isPrimary: true
  })
});

const newDomain = await response.json();
console.log(newDomain.txtRecord); // Copy this to DNS
```

---

## Related Documentation

- [Setup Guide](../custom-domains/setup-guide.md) - User-facing setup instructions
- [Troubleshooting](../custom-domains/troubleshooting.md) - Common issues
- [Architecture](../../INFRASTRUCTURE_API.md) - System architecture
