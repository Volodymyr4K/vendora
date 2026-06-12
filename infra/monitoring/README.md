# Monitoring Stack

## Services

| Service | URL | Credentials |
|---------|-----|-------------|
| **Prometheus** | http://localhost:9090 | - |
| **Alertmanager** | http://localhost:9093 | - |
| **Jaeger** | http://localhost:16686 | - |
| **Grafana** | http://localhost:3001 | admin / admin |

## Quick Start

```bash
# Start all services
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f prometheus
docker-compose logs -f grafana

# Stop all services
docker-compose down

# Stop and remove volumes (clean slate)
docker-compose down -v
```

## Verification

### 1. Check Prometheus Targets
```bash
curl http://localhost:9090/api/v1/targets | jq '.data.activeTargets[] | {job: .labels.job, health: .health}'
```

**Expected:** `vendora-bff` target with `health: "up"` (after BFF starts)

### 2. Check Prometheus Metrics
```bash
# View all metrics from BFF
curl http://localhost:3000/metrics
```

### 3. Access Grafana
1. Open http://localhost:3001
2. Login: `admin` / `admin`
3. Navigate to: Connections → Data Sources
4. Verify **Prometheus** and **Jaeger** are configured

### 4. Check Alerting Rules
```bash
curl http://localhost:9090/api/v1/rules | jq '.data.groups[].rules[] | {alert: .name, state: .state}'
```

## Architecture

**Variant A: BFF on Host, Monitoring in Docker**

```
┌──────────────────────────────────────────┐
│           Host Machine (Mac)             │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │  BFF (Node.js)                     │  │
│  │  Port: 3000                        │  │
│  │  /metrics endpoint                 │  │
│  └────────────────────────────────────┘  │
│               ↑                          │
│               │ scrape via               │
│               │ host.docker.internal     │
├───────────────┼──────────────────────────┤
│    Docker     │                          │
│               │                          │
│  ┌────────────▼────────┐                 │
│  │  Prometheus         │                 │
│  │  :9090              │                 │
│  └─────────┬───────────┘                 │
│            │                             │
│  ┌─────────▼──────────┐                  │
│  │  Alertmanager      │                  │
│  │  :9093             │                  │
│  └────────────────────┘                  │
│                                          │
│  ┌────────────────────┐                  │
│  │  Grafana           │                  │
│  │  :3001             │                  │
│  └────────────────────┘                  │
│                                          │
│  ┌────────────────────┐                  │
│  │  Jaeger            │                  │
│  │  :16686, :4318     │                  │
│  └────────────────────┘                  │
└──────────────────────────────────────────┘
```

## Troubleshooting

### BFF Target shows "down"
```bash
# Check if BFF is running
curl http://localhost:3000/health

# Check Docker can reach host
docker exec vendora-prometheus ping -c 1 host.docker.internal
```

### "Connection refused" errors
- Ensure BFF is running: `cd apps/bff && pnpm dev`
- Verify port 3000 is accessible: `lsof -i :3000`

### Grafana datasource errors
```bash
# Check Prometheus is accessible from Grafana
docker exec vendora-grafana curl http://prometheus:9090/api/v1/status/config
```

## Next Steps

1. Start BFF: `cd apps/bff && pnpm dev`
2. verify Prometheus scraping: http://localhost:9090/targets
3. View metrics: http://localhost:9090/graph
4. Create Grafana dashboard: http://localhost:3001
