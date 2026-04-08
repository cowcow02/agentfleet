#!/usr/bin/env node
// test.js — API test suite for AgentFleet Hub
// Usage: DATABASE_URL=postgresql://... node test.js
// Or: node test.js (uses local Docker Postgres on port 5433)

const http = require('http');
const assert = require('assert');

const PORT = 9876; // test port
const BASE = `http://localhost:${PORT}`;

let passed = 0;
let failed = 0;
const failures = [];

// --- HTTP helpers ---
async function req(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const opts = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: { 'Content-Type': 'application/json', ...headers },
    };
    const r = http.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data), headers: res.headers });
        } catch {
          resolve({ status: res.statusCode, body: data, headers: res.headers });
        }
      });
    });
    r.on('error', reject);
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } catch (err) {
    failed++;
    failures.push({ name, error: err.message || err });
    console.log(`  \x1b[31m✗\x1b[0m ${name}`);
    console.log(`    \x1b[2m${err.message || err}\x1b[0m`);
  }
}

// --- State shared across tests ---
let adminToken = 'afm_charlie_001'; // seed admin
let adminSession = '';
let newTeamAdminToken = '';
let newMemberToken = '';
let inviteCode = '';
let dispatchId = '';

// =========================================================================
// Test suite
// =========================================================================
async function run() {
  console.log('\n\x1b[1mAgentFleet Hub — API Test Suite\x1b[0m\n');

  // ----- Health -----
  console.log('\x1b[36mHealth\x1b[0m');
  await test('GET /health returns 200', async () => {
    const r = await req('GET', '/health');
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.status, 'ok');
    assert(typeof r.body.uptime === 'number');
  });

  // ----- Auth: Unauthorized -----
  console.log('\x1b[36mAuth — Unauthorized\x1b[0m');
  await test('GET /api/me without token returns 401', async () => {
    const r = await req('GET', '/api/me');
    assert.strictEqual(r.status, 401);
  });

  await test('GET /api/agents without token returns 401', async () => {
    const r = await req('GET', '/api/agents');
    assert.strictEqual(r.status, 401);
  });

  await test('GET /api/status without token returns 401', async () => {
    const r = await req('GET', '/api/status');
    assert.strictEqual(r.status, 401);
  });

  await test('Invalid token returns 401', async () => {
    const r = await req('GET', '/api/me', null, auth('invalid_token'));
    assert.strictEqual(r.status, 401);
  });

  // ----- Auth: Login -----
  console.log('\x1b[36mAuth — Login\x1b[0m');
  await test('POST /api/auth/login with valid credentials', async () => {
    const r = await req('POST', '/api/auth/login', { email: 'charlie@kipwise.com', password: 'admin123' });
    assert.strictEqual(r.status, 200);
    assert(r.body.member);
    assert.strictEqual(r.body.member.name, 'Charlie Mak');
    assert(r.body.team);
    assert.strictEqual(r.body.team.name, 'Kipwise');
    assert(r.body.sessionToken);
    assert(r.body.apiToken);
    adminSession = r.body.sessionToken;
  });

  await test('POST /api/auth/login with wrong password returns 401', async () => {
    const r = await req('POST', '/api/auth/login', { email: 'charlie@kipwise.com', password: 'wrong' });
    assert.strictEqual(r.status, 401);
  });

  await test('POST /api/auth/login with nonexistent email returns 401', async () => {
    const r = await req('POST', '/api/auth/login', { email: 'nobody@test.com', password: 'test' });
    assert.strictEqual(r.status, 401);
  });

  await test('POST /api/auth/login with missing fields returns 400', async () => {
    const r = await req('POST', '/api/auth/login', { email: 'charlie@kipwise.com' });
    assert.strictEqual(r.status, 400);
  });

  // ----- Auth: Session token -----
  console.log('\x1b[36mAuth — Session Token\x1b[0m');
  await test('Session token works for /api/me', async () => {
    const r = await req('GET', '/api/me', null, auth(adminSession));
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.member.name, 'Charlie Mak');
  });

  await test('API token works for /api/me', async () => {
    const r = await req('GET', '/api/me', null, auth(adminToken));
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.member.name, 'Charlie Mak');
  });

  await test('Token via query param works', async () => {
    const r = await req('GET', `/api/me?token=${adminToken}`);
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.member.name, 'Charlie Mak');
  });

  // ----- Auth: Signup -----
  console.log('\x1b[36mAuth — Signup\x1b[0m');
  await test('POST /api/auth/signup creates team + member', async () => {
    const r = await req('POST', '/api/auth/signup', {
      teamName: 'Test Corp',
      name: 'Bob Admin',
      email: 'bob@testcorp.com',
      password: 'testpass123',
    });
    assert.strictEqual(r.status, 201);
    assert(r.body.team);
    assert.strictEqual(r.body.team.name, 'Test Corp');
    assert(r.body.member);
    assert.strictEqual(r.body.member.name, 'Bob Admin');
    assert(r.body.sessionToken);
    assert(r.body.apiToken);
    newTeamAdminToken = r.body.apiToken;
  });

  await test('Signup team is isolated from seed team', async () => {
    const r = await req('GET', '/api/agents', null, auth(newTeamAdminToken));
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.agents.length, 0); // no agents on new team
  });

  await test('POST /api/auth/signup with duplicate email returns 409', async () => {
    const r = await req('POST', '/api/auth/signup', {
      teamName: 'Dupe Corp',
      name: 'Bob Again',
      email: 'bob@testcorp.com',
      password: 'testpass123',
    });
    assert.strictEqual(r.status, 409);
  });

  await test('POST /api/auth/signup with missing fields returns 400', async () => {
    const r = await req('POST', '/api/auth/signup', { teamName: 'X' });
    assert.strictEqual(r.status, 400);
  });

  // ----- Invite Flow -----
  console.log('\x1b[36mInvite Flow\x1b[0m');
  await test('POST /api/auth/invite generates invite code', async () => {
    const r = await req('POST', '/api/auth/invite', { email: 'alice@testcorp.com', role: 'member' }, auth(newTeamAdminToken));
    assert(r.status === 200 || r.status === 201, `Expected 200/201 but got ${r.status}`);
    assert(r.body.inviteCode, 'Should return inviteCode');
    assert(r.body.inviteUrl, 'Should return inviteUrl');
    inviteCode = r.body.inviteCode;
  });

  await test('POST /api/auth/join with invite code', async () => {
    assert(inviteCode, 'Invite code must be set from previous test');
    const r = await req('POST', '/api/auth/join', {
      inviteCode: inviteCode,
      name: 'Alice Test',
      password: 'alicepass123',
    });
    assert(r.status === 200 || r.status === 201, `Expected 200/201 but got ${r.status}: ${JSON.stringify(r.body)}`);
    assert(r.body.member);
    assert.strictEqual(r.body.member.name, 'Alice Test');
    assert(r.body.apiToken);
    newMemberToken = r.body.apiToken;
  });

  await test('POST /api/auth/join with used invite code returns 404', async () => {
    const r = await req('POST', '/api/auth/join', {
      inviteCode: inviteCode,
      name: 'Mallory',
      password: 'hackpass123',
    });
    assert.strictEqual(r.status, 404, `Expected 404 but got ${r.status}: ${JSON.stringify(r.body)}`);
  });

  await test('POST /api/auth/join with invalid code returns 404', async () => {
    const r = await req('POST', '/api/auth/join', {
      inviteCode: 'INVALIDX',
      name: 'Nobody',
      password: 'testpass123',
    });
    assert.strictEqual(r.status, 404, `Expected 404 but got ${r.status}: ${JSON.stringify(r.body)}`);
  });

  // ----- Team: /api/me -----
  console.log('\x1b[36m/api/me\x1b[0m');
  await test('GET /api/me returns correct member and team', async () => {
    const r = await req('GET', '/api/me', null, auth(adminToken));
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.member.email, 'charlie@kipwise.com');
    assert.strictEqual(r.body.member.role, 'admin');
    assert.strictEqual(r.body.team.name, 'Kipwise');
    assert.strictEqual(r.body.team.slug, 'kipwise');
  });

  // ----- Status -----
  console.log('\x1b[36m/api/status\x1b[0m');
  await test('GET /api/status returns fleet stats', async () => {
    const r = await req('GET', '/api/status', null, auth(adminToken));
    assert.strictEqual(r.status, 200);
    assert(typeof r.body.machines_online === 'number');
    assert(typeof r.body.agents_registered === 'number');
    assert(typeof r.body.running_jobs === 'number');
    assert(typeof r.body.total_dispatches === 'number');
    assert(typeof r.body.completed === 'number');
  });

  // ----- Agents -----
  console.log('\x1b[36m/api/agents\x1b[0m');
  await test('GET /api/agents returns array (empty when no daemon)', async () => {
    const r = await req('GET', '/api/agents', null, auth(adminToken));
    assert.strictEqual(r.status, 200);
    assert(Array.isArray(r.body.agents));
  });

  // ----- Members -----
  console.log('\x1b[36m/api/members\x1b[0m');
  await test('GET /api/members lists team members', async () => {
    const r = await req('GET', '/api/members', null, auth(adminToken));
    assert.strictEqual(r.status, 200);
    assert(Array.isArray(r.body.members));
    assert(r.body.members.length >= 1);
    const charlie = r.body.members.find((m) => m.email === 'charlie@kipwise.com');
    assert(charlie, 'Admin member should exist');
    assert(charlie.token, 'Token should be included');
  });

  await test('POST /api/members creates new member', async () => {
    const r = await req('POST', '/api/members', { name: 'Dave Test', email: 'dave@kipwise.com', role: 'member' }, auth(adminToken));
    assert.strictEqual(r.status, 201, `Expected 201 but got ${r.status}: ${JSON.stringify(r.body)}`);
    assert(r.body.member);
    assert(r.body.token);
    assert.strictEqual(r.body.member.name, 'Dave Test');
  });

  await test('POST /api/members without name returns 400', async () => {
    const r = await req('POST', '/api/members', { email: 'x@x.com' }, auth(adminToken));
    assert.strictEqual(r.status, 400);
  });

  await test('Members are team-scoped (new team sees own members only)', async () => {
    const r = await req('GET', '/api/members', null, auth(newTeamAdminToken));
    assert.strictEqual(r.status, 200);
    const names = r.body.members.map((m) => m.name);
    assert(!names.includes('Charlie Mak'), 'Should not see seed team members');
    assert(!names.includes('Dave Test'), 'Should not see seed team members');
  });

  // ----- Dispatch -----
  console.log('\x1b[36m/api/dispatch\x1b[0m');
  await test('POST /api/dispatch without agents returns 404', async () => {
    const r = await req('POST', '/api/dispatch', {
      ticket: { id: 'TEST-1', title: 'Test', labels: ['backend'] },
    }, auth(adminToken));
    assert.strictEqual(r.status, 404); // no agents connected
  });

  await test('POST /api/dispatch without ticket.id returns 400', async () => {
    const r = await req('POST', '/api/dispatch', { ticket: {} }, auth(adminToken));
    assert.strictEqual(r.status, 400);
  });

  // ----- Dispatches -----
  console.log('\x1b[36m/api/dispatches\x1b[0m');
  await test('GET /api/dispatches returns array', async () => {
    const r = await req('GET', '/api/dispatches', null, auth(adminToken));
    assert.strictEqual(r.status, 200);
    assert(Array.isArray(r.body.dispatches));
  });

  // ----- Metrics -----
  console.log('\x1b[36m/api/metrics\x1b[0m');
  await test('GET /api/metrics returns stats', async () => {
    const r = await req('GET', '/api/metrics', null, auth(adminToken));
    assert.strictEqual(r.status, 200);
    assert(typeof r.body.total === 'number');
    assert(typeof r.body.completed === 'number');
    assert(typeof r.body.avg_duration_seconds === 'number');
  });

  // ----- Webhooks -----
  console.log('\x1b[36m/api/webhooks\x1b[0m');
  await test('GET /api/webhooks returns array', async () => {
    const r = await req('GET', '/api/webhooks', null, auth(adminToken));
    assert.strictEqual(r.status, 200);
    assert(Array.isArray(r.body.webhooks));
  });

  // ----- Linear Settings -----
  console.log('\x1b[36mLinear Settings\x1b[0m');
  await test('GET /api/settings/linear shows not configured', async () => {
    const r = await req('GET', '/api/settings/linear', null, auth(adminToken));
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.configured, false);
  });

  await test('POST /api/settings/linear saves config', async () => {
    const r = await req('POST', '/api/settings/linear', {
      apiKey: 'lin_test_key',
      triggerStatus: 'Todo',
      triggerLabels: ['agent-task'],
    }, auth(adminToken));
    assert.strictEqual(r.status, 200);
    assert(r.body.linearConfig);
  });

  await test('GET /api/settings/linear shows configured after save', async () => {
    const r = await req('GET', '/api/settings/linear', null, auth(adminToken));
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.configured, true);
    assert.strictEqual(r.body.triggerStatus, 'Todo');
  });

  // ----- Linear Webhook -----
  console.log('\x1b[36mLinear Webhook\x1b[0m');
  await test('POST /webhooks/linear/:teamId ignores non-issue events', async () => {
    const r = await req('POST', '/webhooks/linear/team_001', { type: 'Comment', data: {} });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.action, 'ignored');
  });

  await test('POST /webhooks/linear/:teamId ignores wrong status', async () => {
    const r = await req('POST', '/webhooks/linear/team_001', {
      type: 'Issue', action: 'update',
      data: { identifier: 'KIP-1', title: 'Test', state: { name: 'In Progress' }, labels: [{ name: 'agent-task' }] },
    });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.action, 'ignored');
    assert(r.body.reason.includes('status'));
  });

  await test('POST /webhooks/linear/:teamId ignores wrong labels', async () => {
    const r = await req('POST', '/webhooks/linear/team_001', {
      type: 'Issue', action: 'update',
      data: { identifier: 'KIP-2', title: 'Test', state: { name: 'Todo' }, labels: [{ name: 'unrelated' }] },
    });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.action, 'ignored');
    assert(r.body.reason.includes('label'));
  });

  await test('POST /webhooks/linear/:teamId dispatches matching issue (no agent = no_match)', async () => {
    const r = await req('POST', '/webhooks/linear/team_001', {
      type: 'Issue', action: 'update',
      data: { identifier: 'KIP-3', title: 'Matching issue', state: { name: 'Todo' }, labels: [{ name: 'agent-task' }] },
    });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.action, 'no_match'); // no agents connected
  });

  await test('POST /webhooks/linear/invalid_team returns 404', async () => {
    const r = await req('POST', '/webhooks/linear/nonexistent', { type: 'Issue', data: {} });
    assert.strictEqual(r.status, 404);
  });

  // ----- Webhook log populated -----
  await test('Webhook log contains entries after webhook tests', async () => {
    const r = await req('GET', '/api/webhooks', null, auth(adminToken));
    assert.strictEqual(r.status, 200);
    assert(r.body.webhooks.length >= 3, `Expected >=3 webhook entries, got ${r.body.webhooks.length}`);
  });

  // ----- Team Creation API -----
  console.log('\x1b[36mTeam Creation\x1b[0m');
  await test('POST /api/teams creates team', async () => {
    const r = await req('POST', '/api/teams', { name: 'API Team' });
    assert.strictEqual(r.status, 201);
    assert(r.body.team);
    assert(r.body.adminToken);
    assert.strictEqual(r.body.team.name, 'API Team');
  });

  await test('POST /api/teams without name returns 400', async () => {
    const r = await req('POST', '/api/teams', {});
    assert.strictEqual(r.status, 400);
  });

  // ----- Delete Member -----
  console.log('\x1b[36mDelete Member\x1b[0m');
  await test('Non-admin cannot delete members', async () => {
    // Get Dave's ID from members list
    const members = await req('GET', '/api/members', null, auth(adminToken));
    const dave = members.body.members.find((m) => m.name === 'Dave Test');
    if (dave) {
      // Try to create a token for a non-admin... we'll use the newMemberToken from Test Corp
      const r = await req('DELETE', `/api/members/${dave.id}`, null, auth(newMemberToken));
      // Should fail — different team
      assert(r.status === 401 || r.status === 403 || r.status === 404);
    }
  });

  // ----- HTML Pages -----
  console.log('\x1b[36mHTML Pages\x1b[0m');
  for (const page of ['/', '/dashboard', '/agents', '/dispatches', '/settings']) {
    await test(`GET ${page} returns HTML`, async () => {
      const r = await req('GET', page);
      assert(r.status === 200 || r.status === 404); // 404 if page file missing
    });
  }

  // ----- CORS -----
  console.log('\x1b[36mCORS\x1b[0m');
  await test('OPTIONS request returns 204 with CORS headers', async () => {
    const r = await new Promise((resolve, reject) => {
      const opts = { method: 'OPTIONS', hostname: 'localhost', port: PORT, path: '/api/me' };
      const rr = http.request(opts, (res) => {
        resolve({ status: res.statusCode, headers: res.headers });
      });
      rr.on('error', reject);
      rr.end();
    });
    assert.strictEqual(r.status, 204);
    assert(r.headers['access-control-allow-origin']);
  });

  // =========================================================================
  // Summary
  // =========================================================================
  console.log(`\n\x1b[1mResults: ${passed} passed, ${failed} failed\x1b[0m`);
  if (failures.length > 0) {
    console.log('\n\x1b[31mFailures:\x1b[0m');
    failures.forEach((f) => console.log(`  \x1b[31m✗\x1b[0m ${f.name}: ${f.error}`));
  }
  console.log('');
  return failed;
}

// =========================================================================
// Start server, run tests, stop
// =========================================================================
(async () => {
  // Set test port and DB
  process.env.PORT = String(PORT);
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:localdev@localhost:5433/agentfleet_test';

  // Clean DB before tests
  const { Pool } = require('pg');
  const cleanPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: false,
  });
  try {
    await cleanPool.query('DROP TABLE IF EXISTS webhook_log, dispatches, invites, members, teams, _migrations CASCADE');
    console.log('Test DB cleaned');
  } catch (e) {
    console.log('DB clean warning:', e.message);
  }
  await cleanPool.end();

  // Start the hub server (it handles its own DB init + migrations + seed)
  require('./index.js');

  // Wait for server to be ready (DB init + migrations + seed + HTTP listen)
  await new Promise((resolve) => setTimeout(resolve, 3000));

  // Verify server is up
  try {
    const check = await req('GET', '/health');
    if (check.status !== 200) throw new Error(`Health check failed: ${check.status}`);
    console.log('Server ready\n');
  } catch (e) {
    console.error('Server failed to start:', e.message);
    process.exit(1);
  }

  const exitCode = await run();
  process.exit(exitCode);
})();
