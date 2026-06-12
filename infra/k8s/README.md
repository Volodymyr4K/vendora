# Kubernetes manifests

- `base/` — stable deployment (web + bff + redis + ingress)
- `overlays/canary/` — example canary rollout (NGINX ingress annotations)

> These manifests are templates. Replace image names, hostnames and secrets for your environment.
