#!/bin/bash
SECRET="dev-secret-change-in-production-12345"
DOMAIN="vendora-sushi-hq.localhost"

echo "Starting Rate Limit Verification..."

# 1. Warm up internal
curl -s -o /dev/null -H "x-internal-secret: $SECRET" "http://localhost:4000/internal/resolve-tenant?domain=$DOMAIN"

# 2. Trigger Burst
# We will run 30 internal requests and 50 public requests in parallel

pids=""

# Internal Loop (Should all pass)
for i in {1..30}; do
  (
    code=$(curl -s -o /dev/null -w "%{http_code}" -H "x-internal-secret: $SECRET" "http://localhost:4000/internal/resolve-tenant?domain=$DOMAIN")
    echo "INTERNAL request $i: $code"
  ) &
  pids="$pids $!"
done

# Public Loop (Might hit 429 if limit is low, or just 200)
for i in {1..50}; do
  (
    code=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:4000/health")
    echo "PUBLIC request $i: $code"
  ) &
  pids="$pids $!"
done

# Wait for all
wait $pids

echo "Verification Complete."
