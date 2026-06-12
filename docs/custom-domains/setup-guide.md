# Custom Domain Setup Guide

## Prerequisites

- Active tenant account in Vendora platform
- Domain registered with DNS provider (Namecheap, GoDaddy, Cloudflare, etc.)
- Super Admin access (or request from support team)

---

## Step-by-Step Setup

### Step 1: Add Custom Domain

1. Login to **Super Admin** panel
2. Navigate to **Tenants** → Select your tenant → **Domains**
3. Click **"Add Domain"** button
4. Enter your domain name (e.g., `myrestaurant.com`)
5. Select if this should be the **Primary Domain**
6. Click **"Add Domain"**

**Result:** Domain created with status `PENDING`

---

### Step 2: Configure DNS Records

After adding the domain, you'll see DNS configuration instructions. Copy these records to your DNS provider:

#### TXT Record (Domain Verification)

| Field | Value |
|-------|-------|
| Type | `TXT` |
| Name | `@` (or leave blank for root domain) |
| Value | `vendora-verify=abc123...` *(shown in UI)* |
| TTL | `3600` (1 hour) |

**Purpose:** Proves you own the domain

#### CNAME Record (Traffic Routing)

| Field | Value |
|-------|-------|
| Type | `CNAME` |
| Name | `@` or `www` |
| Value | `cname.vendora-platform.com` *(shown in UI)* |
| TTL | `3600` (1 hour) |

**Note:** For apex domains (no subdomain), some providers require A records instead of CNAME. See [Troubleshooting Guide](./troubleshooting.md#apex-domain-cname-issues).

---

### Step 3: Wait for DNS Propagation

DNS changes take time to propagate globally:

- **Typical time:** 5-60 minutes
- **Maximum time:** Up to 24 hours (rare)

**Check propagation status:**
- Use https://dnschecker.org
- Enter your domain
- Select TXT and CNAME record types

---

### Step 4: Verify Domain

Once DNS has propagated:

1. Return to Super Admin → Domains
2. Find your domain in the list
3. Click **"Verify"** button
4. Wait for verification (5-10 seconds)

**Successful verification:**
- Status changes: `PENDING` → `VERIFIED` ✅
- Green checkmark appears
- Domain becomes active

**Failed verification:**
- Error message shows specific issue
- See [Troubleshooting Guide](./troubleshooting.md)

---

### Step 5: Test Your Domain

1. Open browser
2. Navigate to `https://yourdomain.com`
3. Your restaurant site should load!

**SSL Certificate:**
- Automatically provisioned by platform
- May take 1-2 minutes after verification
- Uses Let's Encrypt

---

## Multiple Domains

You can add multiple domains for one tenant:

**Example:**
- Primary: `myrestaurant.com`
- Alias: `www.myrestaurant.com`
- Alias: `order.myrestaurant.com`

**To add multiple:**
1. Repeat Steps 1-4 for each domain
2. Only ONE domain can be marked as "Primary"
3. All domains route to same tenant

---

## Removing a Domain

1. Super Admin → Domains
2. Click **"Delete"** on domain
3. Confirm deletion
4. DNS records can be removed from provider

**Warning:** Cannot delete Primary domain. Set another domain as Primary first.

---

## Common DNS Provider Instructions

### Cloudflare
1. Dashboard → DNS → Records
2. Add TXT record: Name `@`, Value `vendora-verify=...`
3. Add CNAME: Name `@`, Target `cname.vendora-platform.com`, **Proxy OFF** ⚠️

### Namecheap
1. Domain List → Manage → Advanced DNS
2. Add TXT Record: Host `@`, Value `vendora-verify=...`
3. Add CNAME: Host `@`, Target `cname.vendora-platform.com`

### GoDaddy
1. My Products → DNS
2. Add TXT: Name `@`, Value `vendora-verify=...`
3. Add CNAME: Name `@`, Points to `cname.vendora-platform.com`

---

## Need Help?

- [Troubleshooting Guide](./troubleshooting.md) - Common issues
- [API Documentation](../api/super-admin-domains.md) - For developers
- Support: support@vendora-platform.com
