# Custom Domain Troubleshooting

Common issues and solutions when setting up custom domains.

---

## Domain Status: PENDING (Not Verifying)

### Symptoms
- Domain stuck in `PENDING` status
- Verification fails with error
- "Verify" button keeps showing error

### Common Causes

#### 1. DNS Not Propagated Yet
**Wait time:** DNS changes need 5-60 minutes to propagate globally.

**How to check:**
```bash
# Check TXT record
dig TXT yourdomain.com

# Check CNAME record  
dig CNAME yourdomain.com
```

Or use: https://dnschecker.org

**Solution:** Wait and retry verification after 15 minutes.

---

#### 2. TXT Record Incorrect

**Error message:** `TXT record not found`

**Common mistakes:**
- Wrong verification token (copy-paste error)
- Extra spaces in token value
- Case sensitivity issues
- Multiple TXT records conflicting

**How to verify:**
```bash
dig TXT yourdomain.com +short
```

**Expected output:**
```
"vendora-verify=abc123def456..."
```

**Solution:**
1. Copy TXT value exactly from Super Admin UI
2. Remove any extra spaces
3. Ensure no quotes in DNS provider UI (provider adds them)
4. Save and wait 5 minutes
5. Retry verification

---

#### 3. CNAME Pointing to Wrong Target

**Error message:** `CNAME not pointing to cname.vendora-platform.com`

**How to verify:**
```bash
dig CNAME yourdomain.com +short
```

**Expected output:**
```
cname.vendora-platform.com.
```

**Solution:**
1. Update CNAME to point to `cname.vendora-platform.com`
2. Remove trailing dot if provider adds it automatically
3. Save and wait 5 minutes
4. Retry verification

---

#### 4. Cloudflare Proxy Enabled

**Symptom:** Cloudflare shows orange cloud ☁️ (proxy enabled)

**Problem:** Cloudflare's proxy interferes with DNS verification

**Solution:**
1. Click orange cloud to turn it **gray** (proxy OFF)
2. Required for CNAME record
3. Wait 5 minutes
4. Retry verification
5. **Can re-enable proxy AFTER verification succeeds**

---

## Domain Status: FAILED

### Causes
- DNS records were removed after verification
- Grace period (7 days) expired
- Domain expired/transferred

### Solution

**If DNS still configured correctly:**
1. Click **"Retry Verification"** button
2. Should change to `VERIFIED`

**If DNS was removed:**
1. Re-add TXT and CNAME records
2. Wait for propagation
3. Click **"Retry Verification"**

**If domain transferred/expired:**
1. Contact support for manual intervention
2. Or delete and re-add domain

---

## Domain Verified But Site Shows Error

### Symptom
- Domain shows `VERIFIED` ✅
- But visiting domain shows "Tenant not found" or 404

### Causes

#### 1. Not Set as Primary Domain
**Check:** Is domain marked as Primary in Super Admin?

**Solution:**
1. Super Admin → Domains
2. Click "Set as Primary" on your domain
3. Wait 5 minutes for cache refresh
4. Test domain again

#### 2. Cache Not Cleared
**Solution:**
1. Wait 5 minutes (cache TTL)
2. Clear browser cache
3. Try incognito/private window

#### 3. SSL Certificate Provisioning
**Symptom:** Browser shows "Not Secure" or SSL error

**Solution:**
1. SSL certificates provision automatically
2. Takes 1-2 minutes after verification
3. Wait and refresh

---

## Apex Domain vs WWW Subdomain

### Problem
"I added `example.com` but `www.example.com` doesn't work"

### Solution
Add BOTH domains:

1. Add `example.com` (apex) - set as Primary
2. Add `www.example.com` (subdomain) - set as Alias
3. Both need separate DNS records
4. Both will route to same tenant

**DNS Configuration:**

**For apex (`example.com`):**
- TXT: `@` → `vendora-verify=...`
- A Record: `@` → IP provided in UI

**For www (`www.example.com`):**
- TXT: `www` → `vendora-verify=...`  
- CNAME: `www` → `cname.vendora-platform.com`

---

## Apex Domain CNAME Issues

### Problem
"My DNS provider says CNAME not allowed on apex domain"

### Explanation
RFC 1912 prohibits CNAME on apex domains (`example.com`).

### Solutions

#### Option A: CNAME Flattening (Recommended)
Providers supporting CNAME flattening:
- ✅ Cloudflare (automatic)
- ✅ Cloudflare DNS
- ✅ Route 53 (Alias records)

**Setup:** Add CNAME normally, provider handles it

#### Option B: A Record
1. Super Admin will show IP address
2. Add A record: `@` → `123.45.67.89`
3. Verify domain

**Limitation:** IP may change (rare)

---

## Error: "Domain Already in Use"

### Symptom
"This domain is already registered to another tenant"

### Causes
- Domain added by another tenant
- Duplicate entry in system
- Previous tenant not deleted

### Solution
1. **Check ownership:** Did you previously use this domain?
2. **Contact support:** support@vendora-platform.com
3. **Provide:**
   - Current tenant ID
   - Domain name
   - Proof of ownership (DNS owner email)

Support will transfer domain to your tenant.

---

## Grace Period Warning Emails

### Symptom
Received email: "Domain verification failed - 7 days to fix"

### What happened
- Automated DNS check failed
- DNS records might be removed/changed
- Grace period started (7 days)

### Actions

**Within 7 days:**
1. Check DNS records still configured
2. If missing, re-add them
3. Super Admin → Domains → Click "Verify"
4. Status should return to `VERIFIED`

**If ignored:**
- After 7 days: Domain auto-disabled
- Site switches to default domain
- Receive "Domain Disabled" email

**If disabled:**
- Fix DNS records
- Click "Retry Verification"
- Domain re-enabled immediately

---

## DNS Provider Specific Issues

### Namecheap
**Issue:** Changes not reflecting

**Solution:**
- Changes take 30+ minutes
- Check "Advanced DNS" tab, not "Basic DNS"

### GoDaddy
**Issue:** CNAME shows "Points to" instead of "Value"

**Solution:**
- Both mean same thing
- Enter `cname.vendora-platform.com` in "Points to"

### Google Domains
**Issue:** Requires full domain in CNAME

**Solution:**
- Instead of `@`, use full domain `example.com.`
- Note trailing dot

---

## Still Having Issues?

1. **Check DNS propagation:** https://dnschecker.org
2. **Verify records exactly match UI**
3. **Wait 60 minutes** (maximum propagation time)
4. **Contact support:** support@vendora-platform.com

**Include in support request:**
- Domain name
- Tenant ID
- Screenshot of DNS records
- Error message from verification
