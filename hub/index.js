const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const db = require('./db');

const PORT = process.env.PORT || 9900;
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------
function ts() {
  return new Date().toLocaleTimeString('en-US', { hour12: false });
}
function log(msg) {
  console.log(`[HUB ${ts()}] ${msg}`);
}

// ---------------------------------------------------------------------------
// Token helpers
// ---------------------------------------------------------------------------
function generateToken(prefix) {
  return `${prefix}_${crypto.randomBytes(16).toString('hex')}`;
}

function generateId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// ---------------------------------------------------------------------------
// Password hashing (scrypt)
// ---------------------------------------------------------------------------
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const verify = crypto.scryptSync(password, salt, 64).toString('hex');
  return hash === verify;
}

// ---------------------------------------------------------------------------
// Session tokens
// ---------------------------------------------------------------------------
function createSessionToken(memberId, teamId) {
  const payload = JSON.stringify({ memberId, teamId, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 });
  const signature = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
  return Buffer.from(payload).toString('base64') + '.' + signature;
}

function verifySessionToken(token) {
  try {
    const [payloadB64, signature] = token.split('.');
    if (!payloadB64 || !signature) return null;
    const payload = Buffer.from(payloadB64, 'base64').toString('utf8');
    const expected = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
    if (signature !== expected) return null;
    const data = JSON.parse(payload);
    if (data.exp && data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

function generateInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let code = '';
  const bytes = crypto.randomBytes(8);
  for (let i = 0; i < 8; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return code;
}

// ---------------------------------------------------------------------------
// In-memory data stores
// ---------------------------------------------------------------------------
const teams = new Map();            // teamId -> Team
const membersByToken = new Map();   // token -> { member, team }
const membersByEmail = new Map();   // email -> { member, team }
const invites = new Map();          // inviteCode -> { teamId, email, role, createdAt, expiresAt }
const machines = new Map();         // machineKey (`${teamId}:${machineName}`) -> Machine
const dispatches = [];              // Array<Dispatch>
const webhookLog = [];              // Array<{ timestamp, teamId, action, reason, ticket, dispatch_id }>
let dispatchCounter = 0;

// ---------------------------------------------------------------------------
// Restore state from database (if available)
// ---------------------------------------------------------------------------
async function restoreFromDb() {
  if (!db.isReady()) return false;

  const dbTeams = await db.loadTeams();
  const dbMembers = await db.loadMembers();
  const dbInvites = await db.loadInvites();
  const dbDispatches = await db.loadDispatches();

  if (dbTeams.length === 0) return false; // no data — need seed

  for (const t of dbTeams) {
    const team = { ...t, members: new Map() };
    teams.set(team.id, team);
  }

  for (const m of dbMembers) {
    const team = teams.get(m.teamId);
    if (!team) continue;
    team.members.set(m.id, m);
    membersByToken.set(m.token, { member: m, team });
    if (m.email) membersByEmail.set(m.email, { member: m, team });
  }

  for (const inv of dbInvites) {
    invites.set(inv.code, inv);
  }

  for (const d of dbDispatches) {
    dispatches.push(d);
  }
  dispatchCounter = dispatches.length;

  log(`[DB] Restored ${dbTeams.length} teams, ${dbMembers.length} members, ${dbDispatches.length} dispatches`);
  return true;
}

// ---------------------------------------------------------------------------
// Seed default team (only if no data in DB)
// ---------------------------------------------------------------------------
async function seedData() {
  const team = {
    id: 'team_001',
    name: 'Kipwise',
    slug: 'kipwise',
    members: new Map(),
    linearConfig: null,
    createdAt: new Date().toISOString(),
  };

  const admin = {
    id: 'member_001',
    name: 'Charlie Mak',
    email: 'charlie@kipwise.com',
    passwordHash: hashPassword('admin123'),
    token: 'afm_charlie_001',
    role: 'admin',
    teamId: 'team_001',
    createdAt: new Date().toISOString(),
  };

  team.members.set(admin.id, admin);
  teams.set(team.id, team);
  membersByToken.set(admin.token, { member: admin, team });
  membersByEmail.set(admin.email, { member: admin, team });

  // Persist to DB
  await db.saveTeam(team);
  await db.saveMember(admin);

  log(`Seed team "${team.name}" created (id: ${team.id})`);
  log(`Admin token: ${admin.token}`);
  log(`Default login: charlie@kipwise.com / admin123`);
}

// ---------------------------------------------------------------------------
// HTML page loader — read once at startup, fall back gracefully
// ---------------------------------------------------------------------------
const pages = {};
function loadPage(name) {
  try {
    pages[name] = fs.readFileSync(path.join(__dirname, `${name}.html`), 'utf8');
  } catch {
    pages[name] = null;
  }
}
['landing', 'dashboard', 'agents', 'dispatches', 'settings'].forEach(loadPage);

function servePage(name, res) {
  const html = pages[name];
  if (html) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Page not found');
  }
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
function authenticate(req) {
  let token = null;

  // Check Authorization header
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  }

  // Fall back to query param
  if (!token) {
    try {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      token = url.searchParams.get('token');
    } catch {
      // ignore parse errors
    }
  }

  // Fall back to session cookie
  if (!token) {
    const cookie = req.headers['cookie'];
    if (cookie) {
      const match = cookie.match(/(?:^|;\s*)session=([^;]+)/);
      if (match) token = match[1];
    }
  }

  if (!token) return null;

  // Try API token lookup first (afm_* / aft_* tokens)
  const byToken = membersByToken.get(token);
  if (byToken) return byToken;

  // Try session token decode
  const session = verifySessionToken(token);
  if (session) {
    const team = teams.get(session.teamId);
    if (team) {
      const member = team.members.get(session.memberId);
      if (member) return { member, team };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// CORS helper
// ---------------------------------------------------------------------------
function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

// ---------------------------------------------------------------------------
// JSON body parser
// ---------------------------------------------------------------------------
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// JSON response helpers
// ---------------------------------------------------------------------------
function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data, null, 2));
}

// ---------------------------------------------------------------------------
// Dispatch logic (team-scoped)
// ---------------------------------------------------------------------------
function findAgentForTicket(teamId, ticket) {
  let bestAgent = null;
  let bestMachine = null;
  let bestMachineKey = null;
  let bestScore = 0;

  for (const [machineKey, machine] of machines) {
    if (machine.teamId !== teamId) continue;
    if (machine.ws.readyState !== 1) continue;
    for (const [, agent] of machine.agents) {
      if (agent.running >= agent.capacity) continue;
      const labels = ticket.labels || [];
      const overlap = agent.tags.filter((t) => labels.includes(t)).length;
      if (overlap > bestScore) {
        bestScore = overlap;
        bestAgent = agent;
        bestMachine = machine;
        bestMachineKey = machineKey;
      }
    }
  }

  if (!bestAgent || bestScore === 0) return null;
  return { agent: bestAgent, machine: bestMachine, machineKey: bestMachineKey };
}

function createDispatch(teamId, memberName, ticket, source) {
  const match = findAgentForTicket(teamId, ticket);
  if (!match) return null;

  dispatchCounter++;
  const dispatchId = `d-${String(dispatchCounter).padStart(3, '0')}`;
  const now = new Date().toISOString();

  const dispatch = {
    dispatch_id: dispatchId,
    teamId,
    agent: match.agent.name,
    machine: match.machine.machineName,
    memberName,
    ticket,
    source,
    status: 'dispatched',
    created_at: now,
    updated_at: now,
    messages: [],
  };

  dispatches.push(dispatch);
  db.saveDispatch(dispatch).catch(() => {});
  match.agent.running++;

  const team = teams.get(teamId);
  const teamLabel = team ? team.name : teamId;
  log(`[${teamLabel}] Dispatch ${dispatchId}: ${ticket.id || ticket.identifier || '?'} -> ${match.machine.machineName}/${match.agent.name} (source: ${source})`);

  // Send dispatch to daemon
  if (match.machine.ws.readyState === 1) {
    match.machine.ws.send(JSON.stringify({
      type: 'dispatch',
      dispatch_id: dispatchId,
      agent: match.agent.name,
      ticket,
    }));
  }

  return dispatch;
}

// ---------------------------------------------------------------------------
// HTTP Server
// ---------------------------------------------------------------------------
const httpServer = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // --- CORS on all requests ---
  setCors(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // -----------------------------------------------------------------
  // HTML pages (no auth — pages handle auth client-side)
  // -----------------------------------------------------------------
  if (req.method === 'GET') {
    if (pathname === '/') return servePage('landing', res);
    if (pathname === '/dashboard') return servePage('dashboard', res);
    if (pathname === '/agents') return servePage('agents', res);
    if (pathname === '/dispatches') return servePage('dispatches', res);
    if (pathname === '/settings') return servePage('settings', res);
  }

  // -----------------------------------------------------------------
  // Public API routes (no auth)
  // -----------------------------------------------------------------

  // GET /health
  if (req.method === 'GET' && pathname === '/health') {
    return json(res, 200, { status: 'ok', uptime: process.uptime() });
  }

  // POST /api/teams — create a new team
  if (req.method === 'POST' && pathname === '/api/teams') {
    let body;
    try { body = await parseBody(req); } catch { return json(res, 400, { error: 'Invalid JSON' }); }

    const name = body.name;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return json(res, 400, { error: 'name is required' });
    }

    const teamId = generateId('team');
    const memberId = generateId('member');
    const adminToken = generateToken('aft');
    const slug = slugify(name.trim());

    const team = {
      id: teamId,
      name: name.trim(),
      slug,
      members: new Map(),
      linearConfig: null,
      createdAt: new Date().toISOString(),
    };

    const admin = {
      id: memberId,
      name: 'Admin',
      email: '',
      token: adminToken,
      role: 'admin',
      teamId,
      createdAt: new Date().toISOString(),
    };

    team.members.set(memberId, admin);
    teams.set(teamId, team);
    membersByToken.set(adminToken, { member: admin, team });
    db.saveTeam(team).then(() => db.saveMember(admin)).catch(() => {});

    log(`Team "${team.name}" created (id: ${teamId})`);

    return json(res, 201, {
      team: { id: teamId, name: team.name, slug },
      adminToken,
      firstMemberToken: adminToken,
    });
  }

  // POST /webhooks/linear/:teamId
  const linearWebhookMatch = req.method === 'POST' && pathname.match(/^\/webhooks\/linear\/([^/]+)$/);
  if (linearWebhookMatch) {
    const teamId = linearWebhookMatch[1];
    const team = teams.get(teamId);

    function logWebhook(teamId, action, reason, ticket, dispatchId) {
      const entry = { timestamp: new Date().toISOString(), teamId, action, reason, ticket: ticket || null, dispatch_id: dispatchId || null };
      webhookLog.unshift(entry);
      if (webhookLog.length > 200) webhookLog.pop();
      db.saveWebhookEvent(entry).catch(() => {});
      log(`[Webhook] team=${teamId} action=${action} reason=${reason || '-'} ticket=${ticket?.id || '-'}`);
    }

    if (!team) {
      logWebhook(teamId, 'rejected', 'team not found');
      return json(res, 404, { error: 'Team not found' });
    }

    let body;
    try { body = await parseBody(req); } catch {
      logWebhook(teamId, 'rejected', 'invalid JSON');
      return json(res, 400, { error: 'Invalid JSON' });
    }

    const action = body.action || 'unknown';
    const eventType = body.type || 'unknown';

    if (eventType !== 'Issue' || !body.data) {
      logWebhook(teamId, 'ignored', `not an issue event (type=${eventType}, action=${action})`);
      return json(res, 200, { ok: true, action: 'ignored', reason: 'not an issue event' });
    }

    const config = team.linearConfig;
    if (!config || !config.triggerStatus) {
      logWebhook(teamId, 'ignored', 'no linear config', { id: body.data.identifier || body.data.id, title: body.data.title });
      return json(res, 200, { ok: true, action: 'ignored', reason: 'no linear config' });
    }

    const issue = body.data;
    const stateName = issue.state && issue.state.name;
    const issueLabels = (issue.labels || []).map((l) => l.name);
    const ticketInfo = { id: issue.identifier || issue.id, title: issue.title || '', labels: issueLabels, status: stateName };

    if (stateName !== config.triggerStatus) {
      logWebhook(teamId, 'ignored', `status "${stateName}" != trigger "${config.triggerStatus}"`, ticketInfo);
      return json(res, 200, { ok: true, action: 'ignored', reason: 'status mismatch' });
    }

    const triggerLabels = config.triggerLabels || [];
    const hasMatchingLabel = triggerLabels.length === 0 || triggerLabels.some((tl) => issueLabels.includes(tl));
    if (!hasMatchingLabel) {
      logWebhook(teamId, 'ignored', `labels [${issueLabels.join(',')}] don't match trigger [${triggerLabels.join(',')}]`, ticketInfo);
      return json(res, 200, { ok: true, action: 'ignored', reason: 'label mismatch' });
    }

    const ticket = {
      id: issue.identifier || issue.id,
      title: issue.title || '',
      description: issue.description || '',
      labels: issueLabels,
      priority: issue.priority || 0,
    };

    const dispatch = createDispatch(teamId, 'Linear Webhook', ticket, 'linear');
    if (!dispatch) {
      logWebhook(teamId, 'no_match', 'no matching agent available', ticketInfo);
      return json(res, 200, { ok: true, action: 'no_match', reason: 'no matching agent' });
    }

    logWebhook(teamId, 'dispatched', `→ ${dispatch.machine}/${dispatch.agent}`, ticketInfo, dispatch.dispatch_id);
    return json(res, 200, { ok: true, action: 'dispatched', dispatch_id: dispatch.dispatch_id });
  }

  // -----------------------------------------------------------------
  // Auth API routes (no auth required)
  // -----------------------------------------------------------------

  // POST /api/auth/signup — Create account + team
  if (req.method === 'POST' && pathname === '/api/auth/signup') {
    let body;
    try { body = await parseBody(req); } catch { return json(res, 400, { error: 'Invalid JSON' }); }

    const { name, email, password, teamName } = body;
    if (!name || typeof name !== 'string' || !name.trim()) return json(res, 400, { error: 'name is required' });
    if (!email || typeof email !== 'string' || !email.trim()) return json(res, 400, { error: 'email is required' });
    if (!password || typeof password !== 'string' || password.length < 6) return json(res, 400, { error: 'password must be at least 6 characters' });
    if (!teamName || typeof teamName !== 'string' || !teamName.trim()) return json(res, 400, { error: 'teamName is required' });

    if (membersByEmail.has(email.trim().toLowerCase())) {
      return json(res, 409, { error: 'An account with this email already exists' });
    }

    const teamId = generateId('team');
    const memberId = generateId('member');
    const apiToken = generateToken('afm');
    const slug = slugify(teamName.trim());

    const team = {
      id: teamId,
      name: teamName.trim(),
      slug,
      members: new Map(),
      linearConfig: null,
      createdAt: new Date().toISOString(),
    };

    const member = {
      id: memberId,
      name: name.trim(),
      email: email.trim().toLowerCase(),
      passwordHash: hashPassword(password),
      token: apiToken,
      role: 'admin',
      teamId,
      createdAt: new Date().toISOString(),
    };

    team.members.set(memberId, member);
    teams.set(teamId, team);
    membersByToken.set(apiToken, { member, team });
    membersByEmail.set(member.email, { member, team });
    db.saveTeam(team).then(() => db.saveMember(member)).catch(() => {});

    const sessionToken = createSessionToken(memberId, teamId);

    log(`Team "${team.name}" created via signup (id: ${teamId}, admin: ${member.email})`);

    return json(res, 201, {
      member: { id: memberId, name: member.name, email: member.email, role: member.role },
      team: { id: teamId, name: team.name, slug },
      sessionToken,
      apiToken,
    });
  }

  // POST /api/auth/login — Login with email + password
  if (req.method === 'POST' && pathname === '/api/auth/login') {
    let body;
    try { body = await parseBody(req); } catch { return json(res, 400, { error: 'Invalid JSON' }); }

    const { email, password } = body;
    if (!email || !password) return json(res, 400, { error: 'email and password are required' });

    const entry = membersByEmail.get(email.trim().toLowerCase());
    if (!entry) return json(res, 401, { error: 'Invalid email or password' });

    const { member, team } = entry;
    if (!member.passwordHash || !verifyPassword(password, member.passwordHash)) {
      return json(res, 401, { error: 'Invalid email or password' });
    }

    const sessionToken = createSessionToken(member.id, team.id);

    log(`[${team.name}] Login: ${member.email}`);

    return json(res, 200, {
      member: { id: member.id, name: member.name, email: member.email, role: member.role },
      team: { id: team.id, name: team.name, slug: team.slug },
      sessionToken,
      apiToken: member.token,
    });
  }

  // POST /api/auth/invite — Generate invite code (admin only)
  if (req.method === 'POST' && pathname === '/api/auth/invite') {
    const auth = authenticate(req);
    if (!auth) return json(res, 401, { error: 'Unauthorized' });
    if (auth.member.role !== 'admin') return json(res, 403, { error: 'Admin access required' });

    let body;
    try { body = await parseBody(req); } catch { return json(res, 400, { error: 'Invalid JSON' }); }

    const email = (body.email || '').trim().toLowerCase();
    const role = body.role === 'admin' ? 'admin' : 'member';

    const inviteCode = generateInviteCode();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    invites.set(inviteCode, {
      teamId: auth.team.id,
      email,
      role,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    });
    db.saveInvite({ code: inviteCode, teamId: auth.team.id, email, role, createdAt: now.toISOString(), expiresAt: expiresAt.toISOString() }).catch(() => {});

    const hubUrl = `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}`;
    const inviteUrl = `${hubUrl}/?invite=${inviteCode}`;

    log(`[${auth.team.name}] Invite generated by ${auth.member.name} (code: ${inviteCode}, email: ${email || 'any'}, role: ${role})`);

    return json(res, 201, { inviteCode, inviteUrl });
  }

  // POST /api/auth/join — Join team via invite code
  if (req.method === 'POST' && pathname === '/api/auth/join') {
    let body;
    try { body = await parseBody(req); } catch { return json(res, 400, { error: 'Invalid JSON' }); }

    const { inviteCode, name, password } = body;
    if (!inviteCode) return json(res, 400, { error: 'inviteCode is required' });
    if (!name || typeof name !== 'string' || !name.trim()) return json(res, 400, { error: 'name is required' });
    if (!password || typeof password !== 'string' || password.length < 6) return json(res, 400, { error: 'password must be at least 6 characters' });

    const invite = invites.get(inviteCode);
    if (!invite) return json(res, 404, { error: 'Invalid or expired invite code' });

    if (new Date(invite.expiresAt) < new Date()) {
      invites.delete(inviteCode);
      return json(res, 410, { error: 'Invite code has expired' });
    }

    const team = teams.get(invite.teamId);
    if (!team) return json(res, 404, { error: 'Team no longer exists' });

    const email = (invite.email || body.email || '').trim().toLowerCase();
    if (email && membersByEmail.has(email)) {
      return json(res, 409, { error: 'An account with this email already exists' });
    }

    const memberId = generateId('member');
    const apiToken = generateToken('afm');

    const member = {
      id: memberId,
      name: name.trim(),
      email,
      passwordHash: hashPassword(password),
      token: apiToken,
      role: invite.role,
      teamId: team.id,
      createdAt: new Date().toISOString(),
    };

    team.members.set(memberId, member);
    membersByToken.set(apiToken, { member, team });
    if (email) membersByEmail.set(email, { member, team });
    db.saveMember(member).catch(() => {});

    // Consume the invite
    invites.delete(inviteCode);
    db.deleteInvite(inviteCode).catch(() => {});

    const sessionToken = createSessionToken(memberId, team.id);

    log(`[${team.name}] Member "${member.name}" joined via invite (role: ${invite.role})`);

    return json(res, 201, {
      member: { id: memberId, name: member.name, email: member.email, role: member.role },
      team: { id: team.id, name: team.name, slug: team.slug },
      sessionToken,
      apiToken,
    });
  }

  // -----------------------------------------------------------------
  // Authenticated API routes
  // -----------------------------------------------------------------
  if (pathname.startsWith('/api/')) {
    const auth = authenticate(req);
    if (!auth) {
      return json(res, 401, { error: 'Unauthorized — provide a valid token via Authorization header or ?token= query param' });
    }

    const { member, team } = auth;

    // GET /api/me
    if (req.method === 'GET' && pathname === '/api/me') {
      return json(res, 200, {
        member: { id: member.id, name: member.name, email: member.email, role: member.role },
        team: { id: team.id, name: team.name, slug: team.slug },
      });
    }

    // GET /api/status
    if (req.method === 'GET' && pathname === '/api/status') {
      let machinesOnline = 0;
      let agentsRegistered = 0;
      let runningJobs = 0;
      let totalDispatches = 0;
      let completed = 0;

      for (const [, machine] of machines) {
        if (machine.teamId !== team.id) continue;
        if (machine.ws.readyState === 1) machinesOnline++;
        for (const [, agent] of machine.agents) {
          agentsRegistered++;
          runningJobs += agent.running;
        }
      }

      for (const d of dispatches) {
        if (d.teamId !== team.id) continue;
        totalDispatches++;
        if (d.status === 'completed') completed++;
      }

      return json(res, 200, {
        machines_online: machinesOnline,
        agents_registered: agentsRegistered,
        running_jobs: runningJobs,
        total_dispatches: totalDispatches,
        completed,
      });
    }

    // GET /api/agents
    if (req.method === 'GET' && pathname === '/api/agents') {
      const agents = [];
      for (const [, machine] of machines) {
        if (machine.teamId !== team.id) continue;
        for (const [, agent] of machine.agents) {
          agents.push({
            machine: machine.machineName,
            memberName: machine.memberName,
            name: agent.name,
            description: agent.description,
            tags: agent.tags,
            capacity: agent.capacity,
            running: agent.running,
            online: machine.ws.readyState === 1,
            connectedAt: machine.connectedAt,
            lastHeartbeat: machine.lastHeartbeat,
          });
        }
      }
      return json(res, 200, { agents });
    }

    // GET /api/dispatches
    if (req.method === 'GET' && pathname === '/api/dispatches') {
      const teamDispatches = dispatches
        .filter((d) => d.teamId === team.id)
        .slice()
        .reverse();
      return json(res, 200, { dispatches: teamDispatches });
    }

    // GET /api/metrics
    if (req.method === 'GET' && pathname === '/api/metrics') {
      const teamDispatches = dispatches.filter((d) => d.teamId === team.id);
      const completed = teamDispatches.filter((d) => d.status === 'completed');
      const failed = teamDispatches.filter((d) => d.status === 'failed');
      const running = teamDispatches.filter((d) => d.status === 'running' || d.status === 'dispatched');

      const avgDuration = completed.length > 0
        ? Math.round(completed.reduce((s, d) => s + (d.duration_seconds || 0), 0) / completed.length)
        : 0;

      return json(res, 200, {
        total: teamDispatches.length,
        completed: completed.length,
        failed: failed.length,
        running: running.length,
        avg_duration_seconds: avgDuration,
        total_agent_seconds: completed.reduce((s, d) => s + (d.duration_seconds || 0), 0),
      });
    }

    // GET /api/webhooks — webhook event log (team-scoped)
    if (req.method === 'GET' && pathname === '/api/webhooks') {
      const teamWebhooks = webhookLog.filter((w) => w.teamId === team.id);
      return json(res, 200, { webhooks: teamWebhooks });
    }

    // POST /api/dispatch
    if (req.method === 'POST' && pathname === '/api/dispatch') {
      let body;
      try { body = await parseBody(req); } catch { return json(res, 400, { error: 'Invalid JSON' }); }

      const ticket = body.ticket;
      if (!ticket || !ticket.id) {
        return json(res, 400, { error: 'ticket.id is required' });
      }
      if (!ticket.labels) {
        ticket.labels = [];
      }

      const dispatch = createDispatch(team.id, member.name, ticket, 'manual');
      if (!dispatch) {
        return json(res, 404, { error: 'No matching agent available', labels: ticket.labels });
      }

      return json(res, 200, {
        dispatch_id: dispatch.dispatch_id,
        agent: dispatch.agent,
        machine: dispatch.machine,
      });
    }

    // GET /api/members
    if (req.method === 'GET' && pathname === '/api/members') {
      const members = [];
      for (const [, m] of team.members) {
        members.push({
          id: m.id,
          name: m.name,
          email: m.email,
          role: m.role,
          token: m.token,
          createdAt: m.createdAt,
        });
      }
      return json(res, 200, { members });
    }

    // POST /api/members
    if (req.method === 'POST' && pathname === '/api/members') {
      let body;
      try { body = await parseBody(req); } catch { return json(res, 400, { error: 'Invalid JSON' }); }

      if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
        return json(res, 400, { error: 'name is required' });
      }

      const newId = generateId('member');
      const newToken = generateToken('afm');
      const role = body.role === 'admin' ? 'admin' : 'member';
      const email = (body.email || '').trim().toLowerCase();

      const newMember = {
        id: newId,
        name: body.name.trim(),
        email,
        passwordHash: body.password ? hashPassword(body.password) : null,
        token: newToken,
        role,
        teamId: team.id,
        createdAt: new Date().toISOString(),
      };

      team.members.set(newId, newMember);
      membersByToken.set(newToken, { member: newMember, team });
      if (email) membersByEmail.set(email, { member: newMember, team });
      db.saveMember(newMember).catch(() => {});

      log(`[${team.name}] Member "${newMember.name}" added (role: ${role})`);

      return json(res, 201, {
        member: { id: newId, name: newMember.name, email: newMember.email, role },
        token: newToken,
      });
    }

    // DELETE /api/members/:id
    const memberDeleteMatch = req.method === 'DELETE' && pathname.match(/^\/api\/members\/([^/]+)$/);
    if (memberDeleteMatch) {
      if (member.role !== 'admin') {
        return json(res, 403, { error: 'Admin access required' });
      }

      const targetId = memberDeleteMatch[1];
      const target = team.members.get(targetId);
      if (!target) {
        return json(res, 404, { error: 'Member not found' });
      }

      // Remove from token and email indexes
      membersByToken.delete(target.token);
      if (target.email) membersByEmail.delete(target.email);

      // Disconnect their machines
      for (const [machineKey, machine] of machines) {
        if (machine.teamId === team.id && machine.memberId === targetId) {
          if (machine.ws.readyState === 1) {
            machine.ws.close(1000, 'Member removed');
          }
          machines.delete(machineKey);
        }
      }

      team.members.delete(targetId);
      db.deleteMember(targetId).catch(() => {});
      log(`[${team.name}] Member "${target.name}" removed by ${member.name}`);

      return json(res, 200, { ok: true });
    }

    // GET /api/settings
    if (req.method === 'GET' && pathname === '/api/settings') {
      return json(res, 200, { linearConfig: team.linearConfig || {} });
    }

    // GET /api/settings/linear
    if (req.method === 'GET' && pathname === '/api/settings/linear') {
      const lc = team.linearConfig;
      if (lc && lc.apiKey) {
        return json(res, 200, {
          configured: true,
          triggerStatus: lc.triggerStatus || '',
          triggerLabels: lc.triggerLabels || [],
        });
      }
      return json(res, 200, { configured: false });
    }

    // POST /api/settings/linear
    if (req.method === 'POST' && pathname === '/api/settings/linear') {
      let body;
      try { body = await parseBody(req); } catch { return json(res, 400, { error: 'Invalid JSON' }); }

      team.linearConfig = {
        apiKey: body.apiKey || '',
        triggerStatus: body.triggerStatus || '',
        triggerLabels: body.triggerLabels || [],
      };
      db.updateLinearConfig(team.id, team.linearConfig).catch(() => {});

      const webhookUrl = `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}/webhooks/linear/${team.id}`;

      log(`[${team.name}] Linear config updated`);

      return json(res, 200, {
        linearConfig: team.linearConfig,
        webhookUrl,
      });
    }

    // GET /api/linear/issues
    if (req.method === 'GET' && pathname === '/api/linear/issues') {
      if (!team.linearConfig || !team.linearConfig.apiKey) {
        return json(res, 200, { issues: [], configured: false });
      }

      const query = `{ issues(first: 30, orderBy: updatedAt, filter: { state: { type: { in: ["unstarted", "started"] } } }) { nodes { identifier title description state { name type } labels { nodes { name } } priority priorityLabel assignee { name } url createdAt updatedAt } } }`;

      try {
        const linearRes = await fetch('https://api.linear.app/graphql', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: team.linearConfig.apiKey,
          },
          body: JSON.stringify({ query }),
        });

        const data = await linearRes.json();

        if (data.errors) {
          return json(res, 502, { error: 'Linear API error', details: data.errors });
        }

        const nodes = (data.data && data.data.issues && data.data.issues.nodes) || [];
        const issues = nodes.map((n) => ({
          identifier: n.identifier,
          title: n.title,
          description: n.description || '',
          state: n.state ? n.state.name : '',
          stateType: n.state ? n.state.type : '',
          labels: n.labels && n.labels.nodes ? n.labels.nodes.map((l) => l.name) : [],
          priority: n.priority,
          priorityLabel: n.priorityLabel || '',
          assignee: n.assignee ? n.assignee.name : '',
          url: n.url || '',
          createdAt: n.createdAt,
          updatedAt: n.updatedAt,
        }));

        return json(res, 200, { issues, configured: true });
      } catch (err) {
        return json(res, 502, { error: 'Failed to reach Linear API', details: err.message });
      }
    }

    // Fallthrough for unmatched /api/ routes
    return json(res, 404, { error: 'API route not found' });
  }

  // -----------------------------------------------------------------
  // Fallthrough — not found
  // -----------------------------------------------------------------
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

// ---------------------------------------------------------------------------
// WebSocket Server
// ---------------------------------------------------------------------------
const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (ws) => {
  let machineKey = null;
  let teamId = null;

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      log('Bad WebSocket message (invalid JSON)');
      return;
    }

    // --- Register ---
    if (msg.type === 'register') {
      const token = msg.token;
      if (!token) {
        ws.send(JSON.stringify({ type: 'error', message: 'Token is required' }));
        ws.close(1008, 'Token required');
        return;
      }

      const auth = membersByToken.get(token);
      if (!auth) {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid token' }));
        ws.close(1008, 'Invalid token');
        return;
      }

      const { member, team } = auth;
      const machineName = msg.machine || 'unknown';
      machineKey = `${team.id}:${machineName}`;
      teamId = team.id;

      const agentMap = new Map();
      const agentList = msg.agents || [];
      for (const a of agentList) {
        agentMap.set(a.name, {
          name: a.name,
          description: a.description || '',
          tags: a.tags || [],
          capacity: a.capacity || 1,
          running: 0,
        });
      }

      const now = new Date().toISOString();
      machines.set(machineKey, {
        ws,
        teamId: team.id,
        memberId: member.id,
        memberName: member.name,
        machineName,
        agents: agentMap,
        lastHeartbeat: Date.now(),
        connectedAt: now,
      });

      log(`[${team.name}] Machine "${machineName}" connected (member: ${member.name}, ${agentList.length} agent(s))`);
      for (const a of agentList) {
        log(`[${team.name}]   Agent registered: ${machineName}/${a.name} (tags: ${(a.tags || []).join(', ')})`);
      }

      ws.send(JSON.stringify({ type: 'registered', machine: machineName, agents: agentList.length }));
      return;
    }

    // --- Heartbeat ---
    if (msg.type === 'heartbeat') {
      const key = machineKey || (teamId && msg.machine ? `${teamId}:${msg.machine}` : null);
      if (key) {
        const machine = machines.get(key);
        if (machine) machine.lastHeartbeat = Date.now();
      }
      return;
    }

    // --- Status update ---
    if (msg.type === 'status') {
      const dispatch = dispatches.find((d) => d.dispatch_id === msg.dispatch_id);
      if (dispatch) {
        const elapsed = ((new Date(msg.timestamp) - new Date(dispatch.created_at)) / 1000).toFixed(0);
        dispatch.status = 'running';
        dispatch.updated_at = msg.timestamp;
        dispatch.messages.push({ message: msg.message, timestamp: msg.timestamp });
        db.saveDispatch(dispatch).catch(() => {});
        log(`Status ${msg.dispatch_id}: "${msg.message}" (${elapsed}s since dispatch)`);
      }
      return;
    }

    // --- Complete ---
    if (msg.type === 'complete') {
      const dispatch = dispatches.find((d) => d.dispatch_id === msg.dispatch_id);
      if (dispatch) {
        dispatch.status = msg.success ? 'completed' : 'failed';
        dispatch.exit_code = msg.exit_code;
        dispatch.duration_seconds = msg.duration_seconds || 0;
        dispatch.updated_at = new Date().toISOString();
        db.saveDispatch(dispatch).catch(() => {});
        log(`Complete ${msg.dispatch_id}: ${dispatch.status} (exit ${msg.exit_code}, ${dispatch.duration_seconds}s)`);

        // Decrement running count
        const key = `${dispatch.teamId}:${dispatch.machine}`;
        const machine = machines.get(key);
        if (machine) {
          const agent = machine.agents.get(dispatch.agent);
          if (agent && agent.running > 0) agent.running--;
        }
      }

      ws.send(JSON.stringify({ type: 'ack', dispatch_id: msg.dispatch_id }));
      return;
    }

    log(`Unknown message type: ${msg.type}`);
  });

  ws.on('close', () => {
    if (machineKey) {
      const machine = machines.get(machineKey);
      const teamName = machine ? (teams.get(machine.teamId) || {}).name || machine.teamId : '?';
      const machineName = machine ? machine.machineName : machineKey;
      log(`[${teamName}] Machine "${machineName}" disconnected`);
      machines.delete(machineKey);
    }
  });

  ws.on('error', (err) => {
    log(`WebSocket error: ${err.message}`);
  });
});

// ---------------------------------------------------------------------------
// Stale connection cleanup — every 30s, remove machines with dead WebSockets
// ---------------------------------------------------------------------------
setInterval(() => {
  const now = Date.now();
  for (const [key, machine] of machines) {
    const dead = machine.ws.readyState !== 1;
    const stale = (now - machine.lastHeartbeat) > 60000; // no heartbeat for 60s
    if (dead || stale) {
      const teamName = (teams.get(machine.teamId) || {}).name || machine.teamId;
      const reason = dead ? 'disconnected' : 'no heartbeat for 60s';
      log(`[${teamName}] Removing stale machine "${machine.machineName}" (${reason})`);
      try { machine.ws.terminate(); } catch (_) {}
      machines.delete(key);
    }
  }
}, 15000);

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------
function shutdown() {
  log('Shutting down...');
  wss.close();
  httpServer.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
(async () => {
  // Initialize database (if DATABASE_URL is set)
  await db.init();

  // Restore from DB, or seed if empty
  const restored = await restoreFromDb();
  if (!restored) {
    await seedData();
  }

  httpServer.listen(PORT, () => {
    log(`Hub listening on http://localhost:${PORT} (HTTP + WebSocket)`);
    log(`Database: PostgreSQL (persistent)`);
    log(`Default admin token: afm_charlie_001`);
    log(`Default login: charlie@kipwise.com / admin123`);
  });
})();
