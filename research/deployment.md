# Deployment Options Research

## Deployment Targets

The hub is a single Node.js process with an embedded SQLite database. This makes deployment straightforward -- no database server, no message queue, no multi-container orchestration.

## Option Comparison

| Platform | Setup Complexity | Cost | WebSocket Support | SQLite Support | Persistent Storage | Self-Hosted |
|---|---|---|---|---|---|---|
| **Docker (self-hosted)** | Low | Free (own hardware) | Yes | Yes (volume) | Yes (volume) | Yes |
| **Docker Compose** | Low | Free (own hardware) | Yes | Yes (volume) | Yes (volume) | Yes |
| **Railway** | Very low | ~$5/month | Yes (automatic) | Yes (volume) | Yes (volume) | No (managed) |
| **Fly.io** | Low | ~$5/month | Yes | Yes (volume) | Yes (volume) | No (managed) |
| **Render** | Low | ~$7/month | Yes | Yes (disk) | Yes (disk) | No (managed) |
| **Kubernetes** | High | Varies | Yes (ingress) | Yes (PVC) | Yes (PVC) | Yes |

## Minimum Viable Deployment: Single Docker Container

### Dockerfile

```dockerfile
FROM node:22-slim AS builder

WORKDIR /app

# Install dependencies
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile

# Build
COPY . .
RUN pnpm build

# Production image
FROM node:22-slim

WORKDIR /app

# Install production dependencies only
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile --prod

# Copy built assets
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/drizzle ./drizzle

# Create data directory for SQLite
RUN mkdir -p /app/data

# Non-root user
RUN addgroup --system app && adduser --system --ingroup app app
RUN chown -R app:app /app
USER app

EXPOSE 3001

ENV NODE_ENV=production
ENV DATABASE_PATH=/app/data/agentfleet.db

CMD ["node", "dist/hub/index.js"]
```

### Docker Run (Simplest)

```bash
docker run -d \
  --name agentfleet-hub \
  -p 3001:3001 \
  -v agentfleet-data:/app/data \
  -e TEAM_NAME="my-team" \
  -e JIRA_WEBHOOK_SECRET="xxx" \
  -e LINEAR_WEBHOOK_SECRET="xxx" \
  -e GITHUB_WEBHOOK_SECRET="xxx" \
  agentfleet/hub:latest
```

**One command. One container. One volume.** The SQLite database, team token, and all persistent data live in the `/app/data` volume.

### First Run Output

```
AgentFleet Hub v0.1.0
Team: my-team
Team Token: aft_K7x9mQ2pL4nR8vW1bD6hJ0tF3yA5sC7qE2uX9zN4kM0
  (Save this token -- it won't be shown again)

Dashboard: http://localhost:3001/dashboard
WebSocket: ws://localhost:3001/ws/daemon
Webhooks:  http://localhost:3001/webhooks/{platform}

Listening on :3001
```

## Docker Compose (Hub + Reverse Proxy)

For production self-hosted deployments with TLS:

```yaml
version: "3.8"

services:
  hub:
    image: agentfleet/hub:latest
    restart: unless-stopped
    volumes:
      - agentfleet-data:/app/data
    environment:
      - TEAM_NAME=my-team
      - JIRA_WEBHOOK_SECRET=${JIRA_WEBHOOK_SECRET}
      - LINEAR_WEBHOOK_SECRET=${LINEAR_WEBHOOK_SECRET}
      - GITHUB_WEBHOOK_SECRET=${GITHUB_WEBHOOK_SECRET}
    expose:
      - "3001"

  caddy:
    image: caddy:2
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy-data:/data
      - caddy-config:/config

volumes:
  agentfleet-data:
  caddy-data:
  caddy-config:
```

### Caddyfile

```
hub.example.com {
  reverse_proxy hub:3001
}
```

Caddy automatically:
- Obtains Let's Encrypt TLS certificates
- Handles HTTPS termination
- Proxies WebSocket connections (no special config needed)
- Redirects HTTP to HTTPS

## Railway One-Click Deploy

Railway supports Node.js apps with persistent storage and WebSocket connections.

### railway.json Template

```json
{
  "$schema": "https://railway.com/railway.schema.json",
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "numReplicas": 1,
    "startCommand": "node dist/hub/index.js",
    "healthcheckPath": "/health",
    "healthcheckTimeout": 10
  }
}
```

### Setup Steps

1. Fork the AgentFleet repo
2. Connect to Railway
3. Add environment variables (webhook secrets, team name)
4. Deploy -- Railway auto-detects Node.js, builds, and runs
5. Add a custom domain or use the Railway-provided URL

**Railway advantages:**
- Automatic HTTPS
- WebSocket support built-in
- Persistent volumes (for SQLite)
- Automatic deploys on git push
- Simple pricing (~$5/month for light usage)
- Zero DevOps

**Railway caveat:** Railway restarts containers on deploys. SQLite WAL mode handles this gracefully (no corruption risk), but in-memory state (connected daemons, agent status) is lost. Daemons auto-reconnect within seconds.

## Fly.io Deployment

### fly.toml

```toml
app = "agentfleet-hub"
primary_region = "iad"

[build]
  dockerfile = "Dockerfile"

[http_service]
  internal_port = 3001
  force_https = true
  auto_stop_machines = false    # Keep running for WebSocket connections
  auto_start_machines = true
  min_machines_running = 1

[mounts]
  source = "agentfleet_data"
  destination = "/app/data"

[[vm]]
  size = "shared-cpu-1x"
  memory = "512mb"
```

### Deploy

```bash
fly launch --name agentfleet-hub
fly secrets set JIRA_WEBHOOK_SECRET=xxx LINEAR_WEBHOOK_SECRET=xxx
fly deploy
```

**Fly.io advantages:**
- Multi-region deployment (low latency for distributed teams)
- Persistent volumes
- WebSocket support
- Auto-TLS

**Fly.io caveats:**
- `auto_stop_machines` must be false for WebSocket servers (machines cannot be stopped while connections are active)
- Volume is pinned to a single region/machine (no horizontal scaling with SQLite)
- Slightly more complex setup than Railway

## Kubernetes Helm Chart (Larger Teams)

For organizations already running Kubernetes:

### values.yaml

```yaml
replicaCount: 1  # Must be 1 for SQLite (no horizontal scaling)

image:
  repository: agentfleet/hub
  tag: latest

service:
  type: ClusterIP
  port: 3001

ingress:
  enabled: true
  className: nginx
  annotations:
    nginx.ingress.kubernetes.io/proxy-read-timeout: "3600"     # WebSocket timeout
    nginx.ingress.kubernetes.io/proxy-send-timeout: "3600"
    nginx.ingress.kubernetes.io/proxy-http-version: "1.1"
    nginx.ingress.kubernetes.io/configuration-snippet: |
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection "upgrade";
  hosts:
    - host: hub.example.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: hub-tls
      hosts:
        - hub.example.com

persistence:
  enabled: true
  size: 1Gi
  storageClass: standard

env:
  TEAM_NAME: my-team

secrets:
  JIRA_WEBHOOK_SECRET: ""
  LINEAR_WEBHOOK_SECRET: ""
  GITHUB_WEBHOOK_SECRET: ""

resources:
  requests:
    cpu: 100m
    memory: 256Mi
  limits:
    cpu: 500m
    memory: 512Mi
```

**Kubernetes notes:**
- `replicaCount: 1` is mandatory with SQLite (single-writer constraint)
- Ingress annotations are critical for WebSocket proxying (timeout, upgrade headers)
- PersistentVolumeClaim for the SQLite database
- If the team outgrows SQLite, switch to PostgreSQL and increase replicas

### When Kubernetes is Overkill

For most teams (5-50 developers), Kubernetes adds significant operational complexity:
- Cluster management
- Ingress controller configuration
- PVC lifecycle management
- Certificate management (cert-manager)

Use Kubernetes only if the team already has a cluster and Kubernetes expertise. Otherwise, Docker Compose + Caddy is simpler and equally reliable.

## Deployment Decision Tree

```
Do you already have a Kubernetes cluster?
  Yes → Kubernetes Helm chart
  No ↓

Do you want zero-ops managed hosting?
  Yes ↓
    Is latency for distributed teams important?
      Yes → Fly.io (multi-region)
      No  → Railway (simplest setup)
  No ↓

Do you need custom domain with HTTPS?
  Yes → Docker Compose + Caddy
  No  → Docker run (simplest possible)
```

## Recommended Path

1. **Start with:** Docker run (local testing) or Railway (production MVP)
2. **Graduate to:** Docker Compose + Caddy (self-hosted production)
3. **Later if needed:** Kubernetes Helm chart or Fly.io for multi-region

## Health Check Endpoint

All deployment options benefit from a health check:

```typescript
app.get('/health', (c) => {
  // Check database connection
  try {
    db.run(sql`SELECT 1`);
    return c.json({ status: 'healthy', uptime: process.uptime() });
  } catch {
    return c.json({ status: 'unhealthy' }, 503);
  }
});
```

## Dependencies

No additional dependencies for deployment. The Dockerfile uses the standard Node.js slim image. Caddy is an external container.

## Sources

- [Deploying Node.js Apps: Railway vs Render vs Fly.io](https://dev.to/whoffagents/deploying-nodejs-apps-comparing-railway-render-and-flyio-4cfj)
- [Deploy Node.js Apps: Railway vs Render vs Heroku](https://dev.to/alex_aslam/deploy-nodejs-apps-like-a-boss-railway-vs-render-vs-heroku-zero-server-stress-5p3)
- [Deploy Node.js Apps to Railway - Docker Guide](https://getskyscraper.com/blog/deploy-nodejs-railway-docker-guide)
- [Fly.io Deployment - dockerfile-node](https://deepwiki.com/fly-apps/dockerfile-node/7.1-fly.io-deployment)
- [Deploy Inngest Single Node SQLite - Railway](https://railway.com/deploy/inngest-single-node-sqlite)
- [Can I Deploy Node with SQLite to Fly.io?](https://community.fly.io/t/can-i-just-deploy-a-node-app-with-sqlite3-embedded-to-it/6877)
