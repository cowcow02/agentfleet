# Authentication and Security Research

## Authentication Model Overview

AgentFleet has three auth boundaries:

```
┌──────────────┐     API Key (machine)     ┌──────────────┐
│   Daemon     │ ──────────────────────────>│    Hub       │
│  (per machine)│     WebSocket auth        │  (per team)  │
└──────────────┘                            └──────┬───────┘
                                                   │
                    HMAC signing                    │  Team token
┌──────────────┐   (webhook secret)        ┌───────▼───────┐
│  Jira/Linear │ ──────────────────────────>│  Webhook      │
│  GitHub      │                            │  Receiver     │
└──────────────┘                            └───────────────┘
                                                   │
                    JWT or session                  │
┌──────────────┐                            ┌──────▼────────┐
│  Dashboard   │ <─────────────────────────>│  REST API     │
│  (browser)   │                            │               │
└──────────────┘                            └───────────────┘
```

## 1. API Key Generation and Management

### Recommendation: Cryptographically Random API Keys (not JWT)

For daemon-to-hub auth, use opaque API keys rather than JWTs.

**Why API keys, not JWT:**

| Aspect | API Keys | JWT |
|---|---|---|
| **Revocation** | Instant (delete from DB) | Requires deny-list or short expiry |
| **Stateless** | No (requires DB lookup) | Yes |
| **Size** | 32-44 chars | 200+ chars |
| **Rotation** | Generate new, delete old | Complex (refresh tokens) |
| **Suitable for** | Machine-to-machine, long-lived | User sessions, short-lived |
| **Implementation** | Simple | Complex (signing, verification, refresh) |

For AgentFleet, daemon connections are long-lived, machine-to-machine, and we already have a database. JWT's stateless advantage is irrelevant when we are looking up the machine in the database on every WebSocket connection anyway.

### Key Generation

```typescript
import { randomBytes, createHash } from 'node:crypto';

// Generate a prefixed API key
function generateApiKey(prefix: string): { key: string; hash: string } {
  // 32 bytes = 256 bits of entropy, base64url encoded
  const secret = randomBytes(32).toString('base64url');
  const key = `${prefix}_${secret}`;

  // Store only the hash in the database
  const hash = createHash('sha256').update(key).digest('hex');

  return { key, hash };
}

// Team token (used by dashboard, shown once on team creation)
const { key: teamToken, hash: teamTokenHash } = generateApiKey('aft');
// => aft_K7x9mQ2pL4nR8vW1bD6hJ0tF3yA5sC7qE2uX9zN4kM0

// Machine API key (created when daemon registers)
const { key: machineKey, hash: machineKeyHash } = generateApiKey('afm');
// => afm_P3kR7xQ9mL2nV8wB1dH6jT0fY3aS5cE7qU2xZ9nK4mO

// Verification
function verifyApiKey(key: string, storedHash: string): boolean {
  const hash = createHash('sha256').update(key).digest('hex');
  return timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(storedHash, 'hex'));
}
```

**Key design decisions:**
- **Prefix (`aft_`, `afm_`):** Makes key type identifiable in logs/config without leaking secrets. Follows Stripe's pattern (`sk_`, `pk_`).
- **SHA-256 hash storage:** The actual key is never stored. If the database is compromised, keys cannot be recovered.
- **Base64url encoding:** URL-safe, no padding characters, easy to copy/paste.

### Key Rotation

```typescript
// Machine can have multiple valid keys during rotation
// 1. Generate new key
const { key: newKey, hash: newHash } = generateApiKey('afm');

// 2. Add new key to machine's valid keys
await db.insert(machineKeys).values({
  machineId: 'machine_xyz',
  keyHash: newHash,
  createdAt: new Date(),
});

// 3. Daemon switches to new key
// 4. Delete old key after grace period (e.g., 24 hours)
```

## 2. WebSocket Authentication

### Approach: API Key in HTTP Upgrade Headers

```typescript
// Daemon side: authenticate on connect
import WebSocket from 'ws';

const ws = new WebSocket('wss://hub.example.com/ws', {
  headers: {
    'Authorization': `Bearer ${machineApiKey}`,
    'X-Machine-Id': machineId,
  },
});

// Hub side: verify before upgrading
import { WebSocketServer } from 'ws';

const wss = new WebSocketServer({ noServer: true });

httpServer.on('upgrade', async (request, socket, head) => {
  try {
    const token = request.headers['authorization']?.replace('Bearer ', '');
    const machineId = request.headers['x-machine-id'] as string;

    if (!token || !machineId) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    // Look up machine and verify key
    const machine = await db.query.machines.findFirst({
      where: eq(machines.id, machineId),
    });

    if (!machine || !verifyApiKey(token, machine.apiKeyHash)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    // Update last seen
    await db.update(machines)
      .set({ lastSeenAt: new Date() })
      .where(eq(machines.id, machineId));

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request, machine);
    });
  } catch (err) {
    socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
    socket.destroy();
  }
});
```

**Why this approach:**
- Authentication happens *before* the WebSocket connection is established
- Rejected connections never reach the application layer
- Token is in headers, not in URL (avoids log exposure)
- Uses standard HTTP Authorization header

## 3. HMAC Signing for Dispatch Events

When the hub dispatches a ticket to a daemon, the message should be signed so the daemon can verify it came from the hub (defense in depth, especially if WebSocket traffic crosses untrusted networks).

### Approach: HMAC-SHA256 with Per-Machine Shared Secret

```typescript
import { createHmac, timingSafeEqual } from 'node:crypto';

// Hub side: sign dispatch messages
function signMessage(payload: object, secret: string): string {
  const body = JSON.stringify(payload);
  return createHmac('sha256', secret).update(body).digest('hex');
}

// Hub sends:
const dispatch = {
  type: 'dispatch',
  id: 'msg_abc123',
  timestamp: Date.now(),
  payload: { ticketId: 'PROJ-123', agentTag: 'backend' },
};

ws.send(JSON.stringify({
  ...dispatch,
  signature: signMessage(dispatch, machine.hmacSecret),
}));

// Daemon side: verify
function verifyMessage(message: any, secret: string): boolean {
  const { signature, ...rest } = message;
  if (!signature) return false;

  const expected = createHmac('sha256', secret).update(JSON.stringify(rest)).digest('hex');
  return timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expected, 'hex')
  );
}
```

**Algorithm choice:** HMAC-SHA256 is the industry standard. SHA-256 is fast enough for message-level signing and universally supported.

**Key rotation:** The HMAC secret is derived during machine registration and stored alongside the API key. Rotation follows the same pattern as API key rotation.

## 4. Webhook Signature Verification per Platform

### GitHub: HMAC-SHA256 with `X-Hub-Signature-256`

```typescript
function verifyGitHubWebhook(rawBody: string, signatureHeader: string | undefined): boolean {
  if (!signatureHeader) return false;

  const signature = signatureHeader.replace('sha256=', '');
  const expected = createHmac('sha256', process.env.GITHUB_WEBHOOK_SECRET!)
    .update(rawBody)
    .digest('hex');

  return timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expected, 'hex')
  );
}
```

**Setup:** In GitHub repo/org settings -> Webhooks -> Add webhook -> Set secret.

**Events to subscribe to:** `issues`, `issue_comment`, `pull_request`, `pull_request_review`.

### Linear: HMAC-SHA256 with `Linear-Signature`

```typescript
function verifyLinearWebhook(rawBody: string, signatureHeader: string | undefined): boolean {
  if (!signatureHeader) return false;

  const expected = createHmac('sha256', process.env.LINEAR_WEBHOOK_SECRET!)
    .update(rawBody)
    .digest('hex');

  return timingSafeEqual(
    Buffer.from(signatureHeader, 'hex'),
    Buffer.from(expected, 'hex')
  );
}

// Additionally verify timestamp to prevent replay attacks
function verifyLinearTimestamp(body: { webhookTimestamp: number }): boolean {
  return Math.abs(Date.now() - body.webhookTimestamp) < 60_000; // 60s tolerance
}
```

**Setup:** Linear Settings -> API -> Webhooks -> Create webhook. Signing secret is shown on creation.

**Events to subscribe to:** `Issue` (create, update), `Comment` (create).

### Jira: HMAC-SHA256 with `x-atlassian-webhook-signature`

```typescript
function verifyJiraWebhook(rawBody: string, signatureHeader: string | undefined): boolean {
  if (!signatureHeader) return false;

  const expected = createHmac('sha256', process.env.JIRA_WEBHOOK_SECRET!)
    .update(rawBody)
    .digest('hex');

  return timingSafeEqual(
    Buffer.from(signatureHeader, 'hex'),
    Buffer.from(expected, 'hex')
  );
}
```

**Caveat:** Jira Cloud webhooks registered via REST API (not Atlassian Connect) have inconsistent signature behavior. The recommended approach is to use Atlassian Connect or verify via shared secret in the webhook URL as a secondary mechanism.

**Setup:** Jira Settings -> System -> Webhooks -> Create webhook, or via REST API `POST /rest/api/3/webhook`.

**Events to subscribe to:** `jira:issue_updated`, `jira:issue_created`, `comment_created`.

### Unified Webhook Verification Middleware

```typescript
import { createMiddleware } from 'hono/factory';

const verifyWebhook = createMiddleware(async (c, next) => {
  const platform = c.req.param('platform');
  const rawBody = await c.req.text();

  let valid = false;

  switch (platform) {
    case 'github':
      valid = verifyGitHubWebhook(rawBody, c.req.header('x-hub-signature-256'));
      break;
    case 'linear':
      valid = verifyLinearWebhook(rawBody, c.req.header('linear-signature'));
      if (valid) {
        const body = JSON.parse(rawBody);
        valid = verifyLinearTimestamp(body);
      }
      break;
    case 'jira':
      valid = verifyJiraWebhook(rawBody, c.req.header('x-atlassian-webhook-signature'));
      break;
    default:
      return c.json({ error: 'Unknown platform' }, 400);
  }

  if (!valid) {
    return c.json({ error: 'Invalid webhook signature' }, 401);
  }

  // Store raw body for downstream handlers
  c.set('rawBody', rawBody);
  c.set('parsedBody', JSON.parse(rawBody));
  await next();
});

app.post('/webhooks/:platform', verifyWebhook, async (c) => {
  const body = c.get('parsedBody');
  // Process verified webhook...
});
```

## 5. TLS Certificate Management

### Recommended Approach: Caddy as Reverse Proxy

For self-hosted deployments, Caddy provides automatic HTTPS with zero configuration:

```
# Caddyfile
hub.example.com {
  reverse_proxy localhost:3001

  # WebSocket upgrade is handled automatically
}
```

Caddy automatically:
- Obtains Let's Encrypt certificates
- Handles renewal
- Redirects HTTP to HTTPS
- Terminates TLS (hub sees plain HTTP internally)

### Alternative: Manual Certificates

For internal networks without public DNS:
1. Generate self-signed CA
2. Issue server certificate
3. Distribute CA cert to daemon machines
4. Configure Node.js to trust the CA

```typescript
// Daemon side: trust custom CA
const ws = new WebSocket('wss://hub.internal:3001/ws', {
  ca: readFileSync('/path/to/custom-ca.pem'),
  headers: { 'Authorization': `Bearer ${apiKey}` },
});
```

## 6. Secure Credential Storage on Developer Machines

### macOS: Keychain Access

Use `cross-keychain` (MIT, supports macOS Keychain + Linux Secret Service + Windows Credential Vault):

```typescript
import { getPassword, setPassword, deletePassword } from 'cross-keychain';

const SERVICE_NAME = 'com.agentfleet.daemon';

// Store machine API key
await setPassword(SERVICE_NAME, 'machine-api-key', machineApiKey);

// Retrieve
const apiKey = await getPassword(SERVICE_NAME, 'machine-api-key');

// Delete (on uninstall)
await deletePassword(SERVICE_NAME, 'machine-api-key');
```

### Linux: Secret Service API (libsecret/GNOME Keyring)

`cross-keychain` uses the same API on Linux, backed by `libsecret` (GNOME Keyring or KDE Wallet).

### Fallback: Encrypted File

For headless Linux servers without a desktop environment (no Secret Service):

```typescript
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

const CREDENTIALS_FILE = path.join(configDir, 'credentials.enc');

function encryptCredentials(data: object, passphrase: string): Buffer {
  const salt = randomBytes(16);
  const key = scryptSync(passphrase, salt, 32);
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-gcm', key, iv);

  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(data), 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([salt, iv, authTag, encrypted]);
}
```

**Passphrase derivation:** Use the machine's unique identifier (e.g., hardware UUID from `ioreg` on macOS or `/etc/machine-id` on Linux) combined with the user's login. Not perfect security, but prevents trivial credential theft from file copying.

### Recommendation

1. **Try system keychain first** via `cross-keychain`
2. **Fall back to encrypted file** if keychain unavailable (headless servers)
3. **Never store plaintext** credentials in config files

## 7. Dashboard Authentication

For the dashboard web UI, use simple session-based auth with the team token:

```typescript
// Login: team token -> session cookie
app.post('/api/auth/login', async (c) => {
  const { teamToken } = await c.req.json();

  const team = await findTeamByToken(teamToken);
  if (!team) {
    return c.json({ error: 'Invalid team token' }, 401);
  }

  // Create session
  const sessionId = randomBytes(32).toString('hex');
  sessions.set(sessionId, { teamId: team.id, expiresAt: Date.now() + 24 * 60 * 60 * 1000 });

  setCookie(c, 'session', sessionId, {
    httpOnly: true,
    secure: true,
    sameSite: 'Strict',
    maxAge: 86400,
  });

  return c.json({ team: { id: team.id, name: team.name } });
});
```

**Why not JWT for dashboard:** Session cookies with httpOnly + secure + sameSite=Strict provide better security for browser-based auth. JWT in localStorage is vulnerable to XSS. For a single-team, single-hub deployment, session management complexity is negligible.

## Dependencies

```
cross-keychain          # System keychain access (macOS/Linux/Windows)
```

Node.js built-in `crypto` module handles everything else (HMAC, hashing, random generation, AES encryption).

## Sources

- [WebSocket Authentication in Node.js - Syskool](https://syskool.com/websocket-authentication-in-node-js/)
- [Authenticating Over WebSockets with JWT - Linode](https://www.linode.com/docs/guides/authenticating-over-websockets-with-jwt/)
- [Handling Authentication with JWT the Right Way (2026)](https://dev.to/akshaykurve/handling-authentication-with-jwt-the-right-way-in-nodejs-2026-edition-25na)
- [Secure by Design: Node.js API Security Patterns 2025](https://dev.to/codanyks/secure-by-design-nodejs-api-security-patterns-for-2025-2a9k)
- [GitHub: Validating Webhook Deliveries](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries)
- [Linear: Webhooks Documentation](https://linear.app/developers/webhooks)
- [How to Implement SHA256 Webhook Signature Verification - Hookdeck](https://hookdeck.com/webhooks/guides/how-to-implement-sha256-webhook-signature-verification)
- [cross-keychain - GitHub](https://github.com/magarcia/cross-keychain)
- [Secure Storage of Shell Secrets - Dustin Rue](https://dustinrue.com/2025/02/secure-storage-of-shell-secrets-such-as-api-keys/)
