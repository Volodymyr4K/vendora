# Rollback runbook (Step 6)

## When to rollback
- Spike in 5xx or checkout failures
- High breaker-open state
- Lighthouse regression (LCP/CLS)
- Critical UX regression on menu/checkout

## Fast actions
1) Disable canary traffic (if enabled):
```bash
kubectl annotate ingress vendora-ingress-canary -n vendora nginx.ingress.kubernetes.io/canary-weight="0" --overwrite
```

2) Rollback stable deployment:
```bash
kubectl rollout undo deployment/vendora-web -n vendora
kubectl rollout undo deployment/vendora-bff -n vendora
```

3) Verify health:
```bash
kubectl get pods -n vendora
curl -i https://vendora.example/choose-city
```

## Postmortem checklist
- Capture error samples (Sentry / logs)
- Export Prometheus time window
- Note exact image tags and commit
