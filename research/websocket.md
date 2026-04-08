# WebSocket Implementation Research

## Library Comparison

| Feature | `ws` | `Socket.IO` | `uWebSockets.js` |
|---|---|---|---|
| **npm weekly downloads** | ~90M | ~30M | ~500K |
| **Memory per connection** | ~3 KB | ~15 KB | ~1-2 KB |
| **Max connections (single server)** | ~50K-100K | ~10K-30K | ~200K-500K |
| **Auto-reconnection** | No (manual) | Yes (built-in) | No (manual) |
| **Rooms/namespaces** | No | Yes | Pub/sub built-in |
| **HTTP fallback** | No | Yes (long-polling) | No |
| **Binary support** | Yes | Yes | Yes |
| **Compression** | permessage-deflate | permessage-deflate | permessage-deflate |
| **Client + server** | Yes (same package) | Yes (separate packages) | Server only |
| **TypeScript** | @types/ws | Built-in | Built-in |
| **Native addon** | Optional (bufferutil) | No | Yes (C++ core) |
| **Protocol** | Standard WebSocket | Custom protocol on top of WS | Standard WebSocket |

## Recommendation: `ws`

**`ws` is the right choice for AgentFleet.** Here is the rationale:

1. **Standard WebSocket protocol** -- The daemon-to-hub connection is a backend-to-backend channel (Node.js to Node.js). There is no browser compatibility concern. Socket.IO's HTTP fallback and custom protocol overhead add complexity with zero benefit.

2. **Client and server in one package** -- `ws` works as both the hub's WebSocket server and the daemon's WebSocket client. No additional dependency needed.

3. **Sufficient scale** -- A single hub server handling 50-100K connections covers even very large teams. AgentFleet targets teams of 5-50 developers, each running 1-5 agents. That is at most ~250 concurrent connections, well within `ws` capacity.

4. **Lightweight** -- At ~3 KB per connection, memory pressure is negligible for our use case.

5. **Full control** -- We need a custom message protocol (JSON-RPC style) anyway. Socket.IO's rooms/namespaces abstraction does not map to our dispatch model. Building on raw WebSocket gives us exactly the protocol we need without fighting abstractions.

6. **Mature and battle-tested** -- ~90M weekly downloads. Used by major projects. Stable API.

**Why not Socket.IO:** Adds protocol overhead (each message wrapped in engine.io framing), forces a specific event model, and the reconnection logic -- while convenient -- is easy to implement with `ws` + a small utility. The custom protocol makes debugging harder (cannot use standard WebSocket tools).

**Why not uWebSockets.js:** Performance is irrelevant at our scale (tens of connections, not millions). The C++ binding adds build complexity, platform-specific compilation issues, and a steeper learning curve. The API is less Node.js-idiomatic.

## Auto-Reconnection Strategy

Implement exponential backoff with jitter on the daemon side:

```typescript
class ReconnectingWebSocket {
  private ws: WebSocket | null = null;
  private reconnectAttempt = 0;
  private maxDelay = 30_000; // 30s ceiling
  private baseDelay = 1_000; // 1s base

  connect(url: string) {
    this.ws = new WebSocket(url);

    this.ws.on('open', () => {
      this.reconnectAttempt = 0; // reset on successful connect
    });

    this.ws.on('close', () => {
      this.scheduleReconnect(url);
    });

    this.ws.on('error', () => {
      // error always followed by close, reconnect handled there
    });
  }

  private scheduleReconnect(url: string) {
    const delay = Math.min(
      this.baseDelay * Math.pow(2, this.reconnectAttempt),
      this.maxDelay
    );
    // Add jitter: +/- 25% randomness to prevent thundering herd
    const jitter = delay * 0.25 * (Math.random() * 2 - 1);
    const finalDelay = Math.round(delay + jitter);

    this.reconnectAttempt++;
    setTimeout(() => this.connect(url), finalDelay);
  }
}
```

**Backoff schedule:** 1s, 2s, 4s, 8s, 16s, 30s (ceiling), 30s, 30s, ...

This prevents thundering herd when the hub restarts and all daemons try to reconnect simultaneously.

## Heartbeat / Ping-Pong Protocol

`ws` supports native WebSocket ping/pong frames. The hub should initiate pings:

```typescript
// Hub side: ping all connected daemons every 30s
const HEARTBEAT_INTERVAL = 30_000;
const PONG_TIMEOUT = 10_000;

wss.on('connection', (ws) => {
  ws.isAlive = true;

  ws.on('pong', () => {
    ws.isAlive = true;
  });
});

const heartbeatTimer = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) {
      // No pong received since last ping -- terminate
      ws.terminate();
      return;
    }
    ws.isAlive = false;
    ws.ping();
  });
}, HEARTBEAT_INTERVAL);
```

**Why hub-initiated:** The hub is the authority on connection liveness. If a daemon silently disconnects (network failure, laptop sleep), the hub detects it via missing pong and can update the agent registry immediately.

## NAT Timeout Handling

Most NAT gateways drop idle TCP connections after 60-300 seconds. The 30-second heartbeat interval keeps the connection alive well within this window.

Additionally, WebSocket frames (even empty pings) reset the NAT timeout, so no separate TCP keep-alive is needed as long as the heartbeat interval is shorter than the NAT timeout (which 30s is).

## WebSocket over TLS (wss://)

For self-hosted deployments:

1. **Behind a reverse proxy (recommended):** Use nginx/Caddy with TLS termination. The hub runs plain `ws://` internally, and the proxy handles certificates.
   ```nginx
   location /ws {
     proxy_pass http://localhost:3001;
     proxy_http_version 1.1;
     proxy_set_header Upgrade $http_upgrade;
     proxy_set_header Connection "upgrade";
   }
   ```

2. **Direct TLS:** Use Node.js `https.createServer` with cert/key, then attach `ws.WebSocketServer` to it.
   ```typescript
   import { createServer } from 'https';
   import { WebSocketServer } from 'ws';
   import { readFileSync } from 'fs';

   const server = createServer({
     cert: readFileSync('/path/to/cert.pem'),
     key: readFileSync('/path/to/key.pem'),
   });

   const wss = new WebSocketServer({ server });
   server.listen(3001);
   ```

**Recommendation:** Use a reverse proxy (Caddy is simplest -- automatic HTTPS via Let's Encrypt). The hub itself should not manage certificates.

## Connection Authentication

Three approaches, evaluated:

| Approach | Pros | Cons |
|---|---|---|
| Token in URL query (`?token=xxx`) | Simple, works everywhere | Token in server logs, URL history |
| Token in first message | Clean URL, not logged | Small window of unauthenticated connection |
| Token in HTTP upgrade headers | Most secure, standard HTTP auth | Harder to implement in some WS clients |

**Recommendation: Token in HTTP upgrade headers.**

The daemon controls the WebSocket client, so we can set custom headers on the upgrade request:

```typescript
// Daemon side
const ws = new WebSocket('wss://hub.example.com/ws', {
  headers: {
    'Authorization': `Bearer ${machineApiKey}`,
  },
});

// Hub side
const wss = new WebSocketServer({ noServer: true });

httpServer.on('upgrade', (request, socket, head) => {
  const token = request.headers['authorization']?.replace('Bearer ', '');

  if (!validateMachineApiKey(token)) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }

  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});
```

This approach:
- Authenticates *before* the WebSocket connection is established
- Token never appears in URLs or logs
- Uses standard HTTP authentication header
- `noServer: true` gives full control over the upgrade process

## Scalability Analysis

For AgentFleet's use case (team of 5-50 developers, 1-5 agents each):

| Metric | Worst Case (50 devs x 5 agents) | Single `ws` Server Capacity |
|---|---|---|
| Concurrent connections | 250 | 50,000+ |
| Messages/second (status pings every 5s) | 50 | 100,000+ |
| Memory overhead | 750 KB | Available: GBs |

**Conclusion:** A single `ws` server is more than sufficient. Horizontal scaling (Redis pub/sub backplane) is not needed at launch and should not be built preemptively. If needed later, the standard pattern is:

1. Add Redis pub/sub
2. Sticky sessions (route by machine ID)
3. Each hub instance handles a subset of connections
4. Pub/sub propagates dispatch events across instances

## Message Protocol Design

Use JSON-RPC 2.0 style messages over the WebSocket:

```typescript
// Hub -> Daemon: dispatch a ticket
{
  "type": "dispatch",
  "id": "msg_abc123",
  "payload": {
    "ticketId": "PROJ-123",
    "agentTag": "backend",
    "repo": "https://github.com/org/repo",
    "branch": "main"
  }
}

// Daemon -> Hub: status update
{
  "type": "status",
  "payload": {
    "machineId": "machine_xyz",
    "agentId": "agent_001",
    "ticketId": "PROJ-123",
    "state": "working",
    "tokensUsed": 15000,
    "elapsedMs": 45000
  }
}

// Daemon -> Hub: agent registry update
{
  "type": "registry",
  "payload": {
    "machineId": "machine_xyz",
    "agents": [
      { "id": "backend", "tags": ["backend", "node"], "maxConcurrent": 2 },
      { "id": "frontend", "tags": ["frontend", "react"], "maxConcurrent": 1 }
    ]
  }
}
```

## Dependencies

```
ws                  # WebSocket server (hub) and client (daemon)
```

No additional WebSocket libraries needed. `ws` covers both sides.

## Sources

- [Node.js + WebSockets: ws vs socket.io](https://dev.to/alex_aslam/nodejs-websockets-when-to-use-ws-vs-socketio-and-why-we-switched-di9)
- [WebSockets vs Socket.IO: Complete Real-Time Guide 2025](https://www.mergesociety.com/code-report/websocets-explained)
- [ws vs uWebSockets - StackShare](https://stackshare.io/stackups/uwebsockets-vs-ws)
- [WebSocket vs Socket.IO Performance Guide - Ably](https://ably.com/topic/socketio-vs-websocket)
- [npm trends: ws vs socket.io vs uwebsockets.js](https://npmtrends.com/express-ws-vs-socket.io-vs-uwebsockets.js-vs-websocket-vs-ws)
- [Building a Production-Ready WebSocket Server: Scaling to 100K](https://dev.to/chengyixu/building-a-production-ready-websocket-server-with-nodejs-scaling-to-100k-connections-25mk)
- [Scaling Node.js to 1M Concurrent WebSocket Clients](https://medium.com/@connect.hashblock/scaling-node-js-to-1-million-concurrent-websocket-clients-with-horizontal-sharding-51c20091088e)
- [How to Scale WebSockets for High-Concurrency Systems - Ably](https://ably.com/topic/the-challenge-of-scaling-websockets)
