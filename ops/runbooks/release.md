# Vendora vNext — Release runbook (Step 6)

## Preconditions
- Images built and pushed:
  - `vendora/web:<tag>` and `vendora/bff:<tag>`
- Redis available (or CACHE_MODE=memory for single instance)
- Secrets configured (if/when upstream requires auth)

## Deploy (stable)
```bash
kubectl apply -k infra/k8s/base
```

## Canary rollout (10% traffic, NGINX Ingress)
```bash
kubectl apply -k infra/k8s/overlays/canary
```

## Observe
- `GET /health` for BFF
- Prometheus scrape `/metrics` on BFF
- Track:
  - error rate checkout
  - breaker open rate
  - cache stale rate

## Promote canary -> stable
1) Set stable image to canary tag (or bump stable tag)
2) Increase stable replicas if needed
3) Remove canary ingress / set canary-weight=0

## Rollback
- Re-apply previous kustomize tag (Git revert) OR
- Set stable deployment image back to previous version.
