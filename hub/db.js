// db.js — PostgreSQL persistence layer with auto-migration
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;
let pool = null;
let dbReady = false;

// ---------------------------------------------------------------------------
// Schema migrations — run in order, tracked by version number
// ---------------------------------------------------------------------------
const MIGRATIONS = [
  {
    version: 1,
    name: 'initial_schema',
    sql: `
      CREATE TABLE IF NOT EXISTS teams (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT NOT NULL,
        linear_config JSONB DEFAULT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS members (
        id TEXT PRIMARY KEY,
        team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        password_hash TEXT,
        token TEXT UNIQUE NOT NULL,
        role TEXT NOT NULL DEFAULT 'member',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_members_email ON members(email);
      CREATE INDEX IF NOT EXISTS idx_members_token ON members(token);
      CREATE INDEX IF NOT EXISTS idx_members_team ON members(team_id);

      CREATE TABLE IF NOT EXISTS invites (
        code TEXT PRIMARY KEY,
        team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
        email TEXT,
        role TEXT NOT NULL DEFAULT 'member',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL
      );

      CREATE TABLE IF NOT EXISTS dispatches (
        id TEXT PRIMARY KEY,
        team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
        agent TEXT NOT NULL,
        machine TEXT NOT NULL,
        member_name TEXT,
        ticket JSONB NOT NULL,
        source TEXT NOT NULL DEFAULT 'manual',
        status TEXT NOT NULL DEFAULT 'dispatched',
        exit_code INTEGER,
        duration_seconds INTEGER,
        messages JSONB DEFAULT '[]',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_dispatches_team ON dispatches(team_id);
      CREATE INDEX IF NOT EXISTS idx_dispatches_status ON dispatches(status);

      CREATE TABLE IF NOT EXISTS webhook_log (
        id SERIAL PRIMARY KEY,
        team_id TEXT NOT NULL,
        action TEXT NOT NULL,
        reason TEXT,
        ticket JSONB,
        dispatch_id TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_webhook_log_team ON webhook_log(team_id);

      CREATE TABLE IF NOT EXISTS _migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TIMESTAMPTZ DEFAULT NOW()
      );
    `,
  },
];

// ---------------------------------------------------------------------------
// Initialize pool + run migrations
// ---------------------------------------------------------------------------
async function init() {
  if (!DATABASE_URL) {
    console.error('[DB] FATAL: DATABASE_URL is required. Set it as an environment variable.');
    console.error('[DB] Example: DATABASE_URL=postgresql://user:pass@host:5432/dbname');
    process.exit(1);
  }

  pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL.includes('railway.internal') ? false : (DATABASE_URL.includes('sslmode=require') ? { rejectUnauthorized: false } : false),
    max: 10,
    idleTimeoutMillis: 30000,
  });

  try {
    const client = await pool.connect();
    client.release();
    console.log('[DB] Connected to PostgreSQL');
  } catch (err) {
    console.error('[DB] FATAL: Cannot connect to PostgreSQL:', err.message);
    console.error('[DB] Check your DATABASE_URL and ensure the database is running.');
    process.exit(1);
  }

  await runMigrations();
  dbReady = true;
  return true;
}

async function runMigrations() {
  // Ensure _migrations table exists
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  const { rows } = await pool.query('SELECT version FROM _migrations ORDER BY version');
  const applied = new Set(rows.map((r) => r.version));

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) continue;
    console.log(`[DB] Running migration ${migration.version}: ${migration.name}`);
    await pool.query(migration.sql);
    await pool.query('INSERT INTO _migrations (version, name) VALUES ($1, $2)', [migration.version, migration.name]);
    console.log(`[DB] Migration ${migration.version} applied`);
  }

  console.log('[DB] Migrations complete');
}

// ---------------------------------------------------------------------------
// Query helper
// ---------------------------------------------------------------------------
async function query(sql, params = []) {
  if (!pool) return null;
  return pool.query(sql, params);
}

function isReady() {
  return dbReady;
}

// ---------------------------------------------------------------------------
// Team operations
// ---------------------------------------------------------------------------
async function saveTeam(team) {
  await query(
    `INSERT INTO teams (id, name, slug, linear_config, created_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (id) DO UPDATE SET name=$2, slug=$3, linear_config=$4`,
    [team.id, team.name, team.slug, team.linearConfig ? JSON.stringify(team.linearConfig) : null, team.createdAt]
  );
}

async function loadTeams() {
  const result = await query('SELECT * FROM teams');
  if (!result) return [];
  return result.rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    linearConfig: r.linear_config,
    createdAt: r.created_at?.toISOString(),
  }));
}

async function updateLinearConfig(teamId, config) {
  await query('UPDATE teams SET linear_config=$1 WHERE id=$2', [JSON.stringify(config), teamId]);
}

// ---------------------------------------------------------------------------
// Member operations
// ---------------------------------------------------------------------------
async function saveMember(member) {
  await query(
    `INSERT INTO members (id, team_id, name, email, password_hash, token, role, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (id) DO UPDATE SET name=$3, email=$4, password_hash=$5, role=$7`,
    [member.id, member.teamId, member.name, member.email, member.passwordHash || null, member.token, member.role, member.createdAt]
  );
}

async function loadMembers() {
  const result = await query('SELECT * FROM members');
  if (!result) return [];
  return result.rows.map((r) => ({
    id: r.id,
    teamId: r.team_id,
    name: r.name,
    email: r.email,
    passwordHash: r.password_hash,
    token: r.token,
    role: r.role,
    createdAt: r.created_at?.toISOString(),
  }));
}

async function deleteMember(memberId) {
  await query('DELETE FROM members WHERE id=$1', [memberId]);
}

// ---------------------------------------------------------------------------
// Invite operations
// ---------------------------------------------------------------------------
async function saveInvite(invite) {
  await query(
    `INSERT INTO invites (code, team_id, email, role, created_at, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (code) DO NOTHING`,
    [invite.code, invite.teamId, invite.email || null, invite.role, invite.createdAt, invite.expiresAt]
  );
}

async function loadInvites() {
  const result = await query('SELECT * FROM invites WHERE expires_at > NOW()');
  if (!result) return [];
  return result.rows.map((r) => ({
    code: r.code,
    teamId: r.team_id,
    email: r.email,
    role: r.role,
    createdAt: r.created_at?.toISOString(),
    expiresAt: r.expires_at?.toISOString(),
  }));
}

async function deleteInvite(code) {
  await query('DELETE FROM invites WHERE code=$1', [code]);
}

// ---------------------------------------------------------------------------
// Dispatch operations
// ---------------------------------------------------------------------------
async function saveDispatch(dispatch) {
  await query(
    `INSERT INTO dispatches (id, team_id, agent, machine, member_name, ticket, source, status, exit_code, duration_seconds, messages, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     ON CONFLICT (id) DO UPDATE SET status=$8, exit_code=$9, duration_seconds=$10, messages=$11, updated_at=$13`,
    [dispatch.dispatch_id, dispatch.teamId, dispatch.agent, dispatch.machine, dispatch.memberName,
     JSON.stringify(dispatch.ticket), dispatch.source, dispatch.status,
     dispatch.exit_code || null, dispatch.duration_seconds || null,
     JSON.stringify(dispatch.messages || []), dispatch.created_at, dispatch.updated_at]
  );
}

async function loadDispatches() {
  const result = await query('SELECT * FROM dispatches ORDER BY created_at DESC');
  if (!result) return [];
  return result.rows.map((r) => ({
    dispatch_id: r.id,
    teamId: r.team_id,
    agent: r.agent,
    machine: r.machine,
    memberName: r.member_name,
    ticket: r.ticket,
    source: r.source,
    status: r.status,
    exit_code: r.exit_code,
    duration_seconds: r.duration_seconds,
    messages: r.messages || [],
    created_at: r.created_at?.toISOString(),
    updated_at: r.updated_at?.toISOString(),
  }));
}

// ---------------------------------------------------------------------------
// Webhook log operations
// ---------------------------------------------------------------------------
async function saveWebhookEvent(event) {
  await query(
    `INSERT INTO webhook_log (team_id, action, reason, ticket, dispatch_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [event.teamId, event.action, event.reason || null, event.ticket ? JSON.stringify(event.ticket) : null, event.dispatch_id || null]
  );
}

async function loadWebhookLog(teamId, limit = 100) {
  const result = await query('SELECT * FROM webhook_log WHERE team_id=$1 ORDER BY created_at DESC LIMIT $2', [teamId, limit]);
  if (!result) return [];
  return result.rows.map((r) => ({
    timestamp: r.created_at?.toISOString(),
    teamId: r.team_id,
    action: r.action,
    reason: r.reason,
    ticket: r.ticket,
    dispatch_id: r.dispatch_id,
  }));
}

module.exports = {
  init,
  isReady,
  query,
  saveTeam, loadTeams, updateLinearConfig,
  saveMember, loadMembers, deleteMember,
  saveInvite, loadInvites, deleteInvite,
  saveDispatch, loadDispatches,
  saveWebhookEvent, loadWebhookLog,
};
