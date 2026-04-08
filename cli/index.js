#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const yaml = require('js-yaml');

// --- ANSI colors ---
const C = {
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
};

const http = require('http');

const VERSION = '0.3.0';
const CONFIG_DIR = path.join(os.homedir(), '.agentfleet');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.yaml');
const AGENTS_PATH = path.join(CONFIG_DIR, 'agents.yaml');

// --- Helpers ---

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error(C.red('Error: Not logged in. Run `agentfleet login <token>` first.'));
    process.exit(1);
  }
  try {
    return yaml.load(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (e) {
    console.error(C.red(`Error reading config: ${e.message}`));
    process.exit(1);
  }
}

function hubHttpUrl(hubWsUrl) {
  // Convert wss://host/path to https://host/path, ws:// to http://
  return hubWsUrl.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');
}

function findAgentsYaml() {
  const localPath = path.join(process.cwd(), 'agents.yaml');
  if (fs.existsSync(localPath)) return localPath;
  const globalPath = path.join(CONFIG_DIR, 'agents.yaml');
  if (fs.existsSync(globalPath)) return globalPath;
  return null;
}

// --- Commands ---

async function cmdLogin(args) {
  // Parse: agentfleet login <token> [--hub <url>]
  const tokenIndex = args.indexOf('login') + 1;
  if (tokenIndex >= args.length || args[tokenIndex].startsWith('-')) {
    console.error(C.red('Error: Token is required.'));
    console.error(C.dim('Usage: agentfleet login <token> [--hub <url>]'));
    process.exit(1);
  }
  const token = args[tokenIndex];

  let hub = null;
  const hubFlagIndex = args.indexOf('--hub');
  if (hubFlagIndex !== -1 && hubFlagIndex + 1 < args.length) {
    hub = args[hubFlagIndex + 1];
  }
  if (!hub) {
    hub = process.env.AGENTFLEET_HUB || 'wss://agentfleet-hub-production.up.railway.app';
  }

  const httpBase = hubHttpUrl(hub);
  console.log(C.dim(`Validating token against ${httpBase}...`));

  let res;
  try {
    res = await fetch(`${httpBase}/api/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (e) {
    console.error(C.red(`Error connecting to hub: ${e.message}`));
    process.exit(1);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error(C.red(`Login failed (HTTP ${res.status}): ${body || 'Invalid token'}`));
    process.exit(1);
  }

  const me = await res.json();
  const name = me.member?.name || me.member?.email || 'unknown';
  const teamName = me.team?.name || 'unknown';

  // Save config
  const machineName = os.hostname();
  const configData = {
    hub,
    token,
    machine_name: machineName,
  };
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, yaml.dump(configData), 'utf8');

  console.log(C.green(`Logged in as ${name} (team: ${teamName}). Config saved to ~/.agentfleet/config.yaml`));
}

async function cmdStatus() {
  const config = loadConfig();
  const httpBase = hubHttpUrl(config.hub);

  // Verify token
  let me;
  try {
    const res = await fetch(`${httpBase}/api/me`, {
      headers: { Authorization: `Bearer ${config.token}` },
    });
    if (!res.ok) {
      console.error(C.red(`Token validation failed (HTTP ${res.status}). Try logging in again.`));
      process.exit(1);
    }
    me = await res.json();
  } catch (e) {
    console.error(C.red(`Error connecting to hub: ${e.message}`));
    process.exit(1);
  }

  // Fetch fleet status
  let fleet = null;
  try {
    const res = await fetch(`${httpBase}/api/status`, {
      headers: { Authorization: `Bearer ${config.token}` },
    });
    if (res.ok) {
      fleet = await res.json();
    }
  } catch (_) {
    // fleet status is optional
  }

  const name = me.member?.name || me.member?.email || 'unknown';
  const role = me.member?.role || 'member';
  const teamName = me.team?.name || 'unknown';

  console.log(`Machine: ${C.bold(config.machine_name || os.hostname())}`);
  console.log(`Member:  ${C.bold(name)} (${role})`);
  console.log(`Team:    ${C.bold(teamName)}`);
  console.log(`Hub:     ${C.dim(config.hub)}`);
  console.log(`Status:  ${C.green('Connected \u2713')}`);

  if (fleet) {
    const machines = fleet.machines || fleet.machinesOnline || 0;
    const agents = fleet.agents || fleet.totalAgents || 0;
    const jobs = fleet.runningJobs || fleet.jobs || 0;
    console.log('');
    console.log(`Fleet:   ${machines} machines online, ${agents} agents, ${jobs} running job${jobs !== 1 ? 's' : ''}`);
  }
}

function cmdAgents() {
  const agentsPath = findAgentsYaml();
  if (!agentsPath) {
    console.error(C.red('Error: No agents.yaml found in current directory or ~/.agentfleet/'));
    console.error(C.dim('Create an agents.yaml file to define your local agents.'));
    process.exit(1);
  }

  let manifest;
  try {
    manifest = yaml.load(fs.readFileSync(agentsPath, 'utf8'));
  } catch (e) {
    console.error(C.red(`Error reading ${agentsPath}: ${e.message}`));
    process.exit(1);
  }

  const agents = manifest.agents || [];
  if (agents.length === 0) {
    console.log(C.dim('No agents defined in ' + agentsPath));
    return;
  }

  // Calculate column widths
  const nameWidth = Math.max(12, ...agents.map((a) => (a.name || '').length));
  const tagsWidth = Math.max(27, ...agents.map((a) => (a.tags || []).join(', ').length));
  const capWidth = 8;

  const pad = (s, w) => s + ' '.repeat(Math.max(0, w - s.length));
  const hr = (char, widths) => widths.map((w) => char.repeat(w)).join(char === '\u2500' ? '\u253c' : '\u2500');

  const relPath = path.relative(process.cwd(), agentsPath) || agentsPath;
  console.log(`Local Agents (from ${relPath}):`);

  // Top border
  console.log(`\u250c${'\u2500'.repeat(nameWidth + 2)}\u252c${'\u2500'.repeat(tagsWidth + 2)}\u252c${'\u2500'.repeat(capWidth + 2)}\u2510`);
  // Header
  console.log(`\u2502 ${pad('Name', nameWidth)} \u2502 ${pad('Tags', tagsWidth)} \u2502 ${pad('Capacity', capWidth)} \u2502`);
  // Header separator
  console.log(`\u251c${'\u2500'.repeat(nameWidth + 2)}\u253c${'\u2500'.repeat(tagsWidth + 2)}\u253c${'\u2500'.repeat(capWidth + 2)}\u2524`);
  // Rows
  for (const a of agents) {
    const name = a.name || '';
    const tags = (a.tags || []).join(', ');
    const cap = String(a.capacity || 1);
    console.log(`\u2502 ${pad(name, nameWidth)} \u2502 ${pad(tags, tagsWidth)} \u2502 ${pad(cap, capWidth)} \u2502`);
  }
  // Bottom border
  console.log(`\u2514${'\u2500'.repeat(nameWidth + 2)}\u2534${'\u2500'.repeat(tagsWidth + 2)}\u2534${'\u2500'.repeat(capWidth + 2)}\u2518`);
}

function cmdStart() {
  const config = loadConfig();
  const agentsPath = findAgentsYaml();
  if (!agentsPath) {
    console.error(C.red('Error: No agents.yaml found in current directory or ~/.agentfleet/'));
    console.error(C.dim('Create an agents.yaml file to define your local agents.'));
    process.exit(1);
  }

  const daemonPath = path.join(__dirname, '..', 'apps', 'daemon', 'index.js');
  if (!fs.existsSync(daemonPath)) {
    console.error(C.red(`Error: Daemon not found at ${daemonPath}`));
    process.exit(1);
  }

  console.log(C.dim(`Starting daemon...`));
  console.log(C.dim(`  Hub:    ${config.hub}`));
  console.log(C.dim(`  Agents: ${agentsPath}`));
  console.log('');

  const { spawn } = require('child_process');
  const child = spawn('node', [daemonPath], {
    env: {
      ...process.env,
      AGENTFLEET_HUB: config.hub,
      AGENTFLEET_TOKEN: config.token,
      MANIFEST: agentsPath,
    },
    stdio: 'inherit',
  });

  child.on('error', (err) => {
    console.error(C.red(`Failed to start daemon: ${err.message}`));
    process.exit(1);
  });

  child.on('close', (code) => {
    process.exit(code || 0);
  });
}

function cmdSetup() {
  const config = loadConfig();
  const httpBase = hubHttpUrl(config.hub);
  const SETUP_PORT = 9901;

  // Read setup.html
  const htmlPath = path.join(__dirname, 'setup.html');
  if (!fs.existsSync(htmlPath)) {
    console.error(C.red('Error: setup.html not found at ' + htmlPath));
    process.exit(1);
  }
  const setupHtml = fs.readFileSync(htmlPath, 'utf8');

  // Load agents.yaml if it exists
  function loadAgents() {
    const agentsPath = findAgentsYaml();
    if (!agentsPath) return [];
    try {
      const manifest = yaml.load(fs.readFileSync(agentsPath, 'utf8'));
      return manifest.agents || [];
    } catch (e) {
      return [];
    }
  }

  // Helper: read full request body
  function readBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => resolve(Buffer.concat(chunks).toString()));
      req.on('error', reject);
    });
  }

  // Helper: proxy to hub API
  async function hubProxy(apiPath, res) {
    try {
      const hubRes = await fetch(`${httpBase}${apiPath}`, {
        headers: { Authorization: `Bearer ${config.token}` },
      });
      const data = await hubRes.json();
      res.writeHead(hubRes.status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(data));
    } catch (e) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Hub unreachable: ' + e.message }));
    }
  }

  const server = http.createServer(async (req, res) => {
    // CORS for all responses
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      res.end();
      return;
    }

    const url = new URL(req.url, `http://localhost:${SETUP_PORT}`);

    // Serve HTML
    if (url.pathname === '/' || url.pathname === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(setupHtml);
      return;
    }

    // API: GET /api/config
    if (url.pathname === '/api/config' && req.method === 'GET') {
      const agents = loadAgents();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        hub: config.hub,
        token: config.token ? '***' : '',
        machine_name: config.machine_name || os.hostname(),
        home: os.homedir(),
        agents,
      }));
      return;
    }

    // API: GET /api/me — proxy to hub
    if (url.pathname === '/api/me' && req.method === 'GET') {
      await hubProxy('/api/me', res);
      return;
    }

    // API: GET /api/agents — proxy to hub
    if (url.pathname === '/api/agents' && req.method === 'GET') {
      await hubProxy('/api/agents', res);
      return;
    }

    // API: POST /api/agents — save agents.yaml
    if (url.pathname === '/api/agents' && req.method === 'POST') {
      try {
        const body = JSON.parse(await readBody(req));
        const agentsData = body.agents || [];

        const yamlContent = yaml.dump({ agents: agentsData }, {
          lineWidth: -1,
          quotingType: '"',
          forceQuotes: false,
        });

        fs.mkdirSync(CONFIG_DIR, { recursive: true });
        fs.writeFileSync(AGENTS_PATH, yamlContent, 'utf8');

        console.log(C.green(`Saved ${agentsData.length} agent(s) to ${AGENTS_PATH}`));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, path: AGENTS_PATH }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
      return;
    }

    // API: POST /api/restart — restart daemon
    if (url.pathname === '/api/restart' && req.method === 'POST') {
      const { execSync, spawn: spawnChild } = require('child_process');

      // Kill existing daemon
      try {
        execSync('pkill -f "daemon/index.js"', { stdio: 'ignore' });
        console.log(C.dim('Killed existing daemon process'));
      } catch (_) {
        // No daemon running, that's fine
      }

      // Find agents.yaml
      const agentsPath = findAgentsYaml();
      if (!agentsPath) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, message: 'No agents.yaml found. Save agents first.' }));
        return;
      }

      // Find daemon path
      const daemonPath = path.join(__dirname, '..', 'apps', 'daemon', 'index.js');
      if (!fs.existsSync(daemonPath)) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, message: 'Daemon not found at ' + daemonPath }));
        return;
      }

      // Start new daemon in background
      const child = spawnChild('node', [daemonPath], {
        env: {
          ...process.env,
          AGENTFLEET_HUB: config.hub,
          AGENTFLEET_TOKEN: config.token,
          MANIFEST: agentsPath,
        },
        stdio: 'ignore',
        detached: true,
      });
      child.unref();

      console.log(C.green(`Daemon restarted (PID: ${child.pid})`));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, pid: child.pid }));
      return;
    }

    // 404
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  server.listen(SETUP_PORT, () => {
    const url = `http://localhost:${SETUP_PORT}`;
    console.log(C.bold('Agent Setup running at ') + C.cyan(url));
    console.log(C.dim('Press Ctrl+C to stop.'));

    // Open in browser (macOS)
    const { exec } = require('child_process');
    exec(`open ${url}`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(C.red(`Port ${SETUP_PORT} is already in use. Is another setup instance running?`));
    } else {
      console.error(C.red(`Server error: ${err.message}`));
    }
    process.exit(1);
  });
}

function cmdHelp() {
  console.log(`${C.bold('AgentFleet CLI')} v${VERSION}

${C.bold('Usage:')} agentfleet <command>

${C.bold('Commands:')}
  login <token>     Login with your member token (get it from hub settings)
  status            Show connection status and fleet info
  agents            List local agent definitions
  setup             Open web UI to configure agents visually
  start             Start the daemon (connects to hub)
  help              Show this help

${C.bold('Options:')}
  --hub <url>       Hub URL (default: saved in config)

Config: ~/.agentfleet/config.yaml
Agents: ./agents.yaml or ~/.agentfleet/agents.yaml`);
}

// --- Main ---
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';

  switch (command) {
    case 'login':
      await cmdLogin(args);
      break;
    case 'status':
      await cmdStatus();
      break;
    case 'agents':
      cmdAgents();
      break;
    case 'setup':
      cmdSetup();
      break;
    case 'start':
      cmdStart();
      break;
    case 'help':
    case '--help':
    case '-h':
      cmdHelp();
      break;
    default:
      console.error(C.red(`Unknown command: ${command}`));
      console.error(C.dim('Run `agentfleet help` for usage.'));
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(C.red(`Fatal error: ${err.message}`));
  process.exit(1);
});
