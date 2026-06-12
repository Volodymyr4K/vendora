# Production Deployment Checklist

Use this checklist before deploying custom domains to production.

## Pre-Deployment

### Environment Variables
- [ ] `REDIS_HOST` and `REDIS_PORT` configured
- [ ] `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` configured (media proxy)
- [ ] `SMTP_*` variables set for email notifications
- [ ] `SLACK_WEBHOOK_URL` configured (optional)
- [ ] `DOMAIN_VERIFICATION_INTERVAL` set (default: `0 */6 * * *`)
- [ ] `GRACE_PERIOD_DAYS` set (default: `7`)
- [ ] `INTERNAL_API_SECRET` strong and unique
- [ ] `JWT_SECRET` not using default value
- [ ] `COOKIE_SECRET` not using default value

### Database
- [ ] All migrations applied: `npx prisma migrate deploy`
- [ ] Indexes created (migration `20260112084406_add_performance_indexes`)
- [ ] Database backed up before migration
- [ ] Connection pooling configured

### Infrastructure
- [ ] Redis running and accessible
- [ ] PostgreSQL running and accessible
- [ ] Docker containers have `restart: always`
- [ ] Health checks configured (`/health`)
- [ ] Metrics endpoint secured (`/metrics` requires `INTERNAL_API_SECRET`)

### Code Quality
- [ ] All tests passing: `pnpm test` (17/17)
- [ ] No lint errors
- [ ] TypeScript compilation successful: `pnpm build`
- [ ] Dependencies up to date (security patches)

---

## Deployment

### Build
- [ ] Run production build: `pnpm build`
- [ ] Build artifacts generated successfully
- [ ] No warnings in build output

### Deploy BFF
- [ ] Deploy BFF (blue-green deployment recommended)
- [ ] Wait for health check: `GET /health` returns 200
- [ ] Cache warming completes: check logs for `[CACHE-WARMER] Completed`
- [ ] Cron job starts: check logs for `[CRON] Started domain verification`

### Deploy Web (Next.js)
- [ ] Deploy Web application
- [ ] Verify middleware running
- [ ] Test tenant resolution with custom domain
- [ ] SSL certificates auto-provisioned

---

## Post-Deployment Verification

### Smoke Tests
- [ ] Create test domain via Super Admin
- [ ] Verify DNS instructions displayed
- [ ] Trigger verification (should handle gracefully even if DNS not configured)
- [ ] Check audit logs: `grep "[AUDIT]" logs/*`
- [ ] Delete test domain

### Monitoring
- [ ] Grafana dashboard accessible
- [ ] All panels showing data
- [ ] Prometheus scraping `/metrics` endpoint
- [ ] Alerts configured in AlertManager
- [ ] Test alert (trigger manually):
  ```bash
  # Simulate high failure rate for testing
  curl -X POST http://localhost:9093/api/v1/alerts
  ```

### Performance
- [ ] p95 domain resolution latency < 50ms
- [ ] Cache hit rate > 80%
- [ ] Cron job completes in < 1 minute for typical load
- [ ] Memory usage stable (no leaks)

### Logs
- [ ] Audit logs showing domain events
- [ ] No error spikes in logs
- [ ] Cron job logs show successful runs
- [ ] Cache warming logs show success

---

## Rollback Criteria

**Roll back immediately if:**

- [ ] Error rate > 1% for 5+ minutes
- [ ] p95 latency > 500ms
- [ ] Critical alert fires (cron stalled, high DNS failures)
- [ ] Database connection errors
- [ ] Redis connection errors
- [ ] Memory usage > 2GB (indicates leak)

**Rollback procedure:**
1. Revert BFF deployment
2. Revert Web deployment if needed
3. Check database consistency
4. Investigate logs before redeploying

---

## Success Criteria

**Production is HEALTHY if:**

- [x] All smoke tests pass
- [x] Grafana showing green metrics
- [x] No critical alerts
- [x] p95 latency < 100ms
- [x] Cache hit rate > 70%
- [x] Cron job running every 6 hours
- [x] Zero errors in last 15 minutes

---

## Day 1 Monitoring

**Monitor these for 24 hours:**

- [ ] Error rates (should be < 0.1%)
- [ ] DNS verification success rate (should be > 80%)
- [ ] Grace period domains (should not spike)
- [ ] Cache performance (hit rate > 80%)
- [ ] Memory usage (should be stable)
- [ ] Cron job execution (every 6 hours)

**Checkpoints:**
- **1 hour:** Quick check of all metrics
- **4 hours:** Verify cron ran successfully
- **8 hours:** Deep dive into logs
- **24 hours:** Full system health review

---

## Contact Information

**On-call engineer:** [Your name/phone]
**Escalation:** [Team lead/phone]
**Slack channel:** #custom-domains-alerts
**Runbook:** https://docs.vendora.com/runbooks/custom-domains

---

**Checklist completed by:** ___________________  
**Date:** ___________________  
**Deployment approved by:** ___________________
