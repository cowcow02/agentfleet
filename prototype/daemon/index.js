const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const yaml = require('js-yaml');

// --- Load manifest ---
// Resolution order: MANIFEST env var -> ./agents.yaml -> ~/.agentfleet/agents.yaml
function resolveManifestPath() {
  if (process.env.MANIFEST) return process.env.MANIFEST;
  const localPath = path.join(process.cwd(), 'agents.yaml');
  if (fs.existsSync(localPath)) return localPath;
  const globalPath = path.join(os.homedir(), '.agentfleet', 'agents.yaml');
  if (fs.existsSync(globalPath)) return globalPath;
  // Final fallback to __dirname for backward compatibility
  return path.join(__dirname, 'agents.yaml');
}
const manifestPath = resolveManifestPath();
const manifest = yaml.load(fs.readFileSync(manifestPath, 'utf8'));
// Also try reading ~/.agentfleet/config.yaml for hub, token, machine_name
let configData = {};
try {
  const configPath = path.join(os.homedir(), '.agentfleet', 'config.yaml');
  if (fs.existsSync(configPath)) {
    configData = yaml.load(fs.readFileSync(configPath, 'utf8')) || {};
  }
} catch (_) {}

const HUB_URL = process.env.AGENTFLEET_HUB || manifest.hub || configData.hub || 'ws://localhost:9900';
const TOKEN = process.env.AGENTFLEET_TOKEN || manifest.token || configData.token || '';
const MACHINE_NAME = manifest.machine_name || configData.machine_name || os.hostname();
const agents = manifest.agents || [];

// --- Logging ---
function ts() {
  return new Date().toLocaleTimeString('en-US', { hour12: false });
}
function log(msg) {
  console.log(`[DAEMON ${ts()}] ${msg}`);
}

// --- Duration formatter ---
function formatDuration(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

// --- State ---
const runningJobs = new Map();  // dispatch_id -> { process, agentName, startedAt }
let ws = null;
let reconnectTimer = null;
let heartbeatTimer = null;
let shuttingDown = false;

// --- WebSocket Connection ---
function connect() {
  if (shuttingDown) return;

  log(`Connecting to hub at ${HUB_URL}...`);
  ws = new WebSocket(HUB_URL);

  ws.on('open', () => {
    log('Connected to hub');

    // Register agents
    const registration = {
      type: 'register',
      token: TOKEN,
      machine: MACHINE_NAME,
      agents: agents.map((a) => ({
        name: a.name,
        description: a.description || '',
        tags: a.tags || [],
        capacity: a.capacity || 1,
      })),
    };
    ws.send(JSON.stringify(registration));
    log(`Registered ${agents.length} agent(s): ${agents.map((a) => a.name).join(', ')}`);

    // Start heartbeat
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(sendHeartbeat, 10000);
  });

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch (e) {
      log('Bad message from hub: ' + raw);
      return;
    }

    if (msg.type === 'dispatch') {
      handleDispatch(msg);
      return;
    }

    if (msg.type === 'ack') {
      log(`Ack received for ${msg.dispatch_id}`);
      return;
    }

    if (msg.type === 'error') {
      log(`ERROR from hub: ${msg.message}`);
      if (msg.message && msg.message.includes('Invalid token')) {
        log('Check your token in agents.yaml or AGENTFLEET_TOKEN env var');
        process.exit(1);
      }
      return;
    }

    log(`Unknown message from hub: ${msg.type}`);
  });

  ws.on('close', () => {
    log('Disconnected from hub');
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    scheduleReconnect();
  });

  ws.on('error', (err) => {
    log(`WebSocket error: ${err.message}`);
  });
}

function scheduleReconnect() {
  if (shuttingDown) return;
  if (reconnectTimer) return;
  log('Reconnecting in 3s...');
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, 3000);
}

function sendHeartbeat() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  const running = [];
  for (const [dispatchId, job] of runningJobs) {
    running.push({ dispatch_id: dispatchId, agent: job.agentName });
  }
  ws.send(JSON.stringify({
    type: 'heartbeat',
    machine: MACHINE_NAME,
    running,
  }));
}

// --- Dispatch Handling ---
function handleDispatch(msg) {
  const { dispatch_id, agent: agentName, ticket } = msg;
  const agentDef = agents.find((a) => a.name === agentName);

  if (!agentDef) {
    log(`ERROR: No agent definition for "${agentName}"`);
    return;
  }

  log(`Spawning ${agentName} for ${ticket.id}`);

  // Build command by substituting placeholders
  let cmd = agentDef.invoke.command;
  cmd = cmd.replace(/\{ticket_id\}/g, ticket.id || '');
  cmd = cmd.replace(/\{ticket_title\}/g, ticket.title || '');
  cmd = cmd.replace(/\{ticket_description\}/g, ticket.description || '');

  // Spawn the process
  const workdir = agentDef.invoke.workdir || process.cwd();
  const launcher = agentDef.invoke.launcher || 'headless';
  let child;

  // Write the agent command to a temp script to avoid quote escaping issues
  const scriptDir = path.join(os.tmpdir(), 'agentfleet');
  fs.mkdirSync(scriptDir, { recursive: true });
  const scriptPath = path.join(scriptDir, `${dispatch_id}.sh`);
  const scriptContent = [
    '#!/usr/bin/env bash',
    `cd "${workdir}"`,
    `echo ""`,
    `echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"`,
    `echo "  AgentFleet Dispatch: ${ticket.id} → ${agentName}"`,
    `echo "  ${(ticket.title || '').replace(/'/g, "'\\''")}"`,
    `echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"`,
    `echo ""`,
    cmd,
  ].join('\n');
  fs.writeFileSync(scriptPath, scriptContent, { mode: 0o755 });

  // Interpolate launcher template variables
  // Available: {script}, {workdir}, {ticket_id}, {agent_name}, {dispatch_id}
  const interpolateLauncher = (template) => {
    return template
      .replace(/\{script\}/g, scriptPath)
      .replace(/\{workdir\}/g, workdir)
      .replace(/\{ticket_id\}/g, ticket.id || '')
      .replace(/\{agent_name\}/g, agentName)
      .replace(/\{dispatch_id\}/g, dispatch_id);
  };

  if (typeof launcher === 'string' && launcher !== 'headless') {
    const launchCmd = interpolateLauncher(launcher);
    log(`[${agentName}] Launching: ${launchCmd}`);
    child = spawn('sh', ['-c', launchCmd], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } else {
    // Headless — piped stdio, no visible terminal
    child = spawn('sh', ['-c', `cd "${workdir}" && ${cmd}`], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  }

  const isHeadless = launcher === 'headless';

  runningJobs.set(dispatch_id, { process: child, agentName, startedAt: Date.now(), state: 'active', idleSince: null });

  // Send started status
  sendStatus(dispatch_id, 'started');

  if (isHeadless) {
    // --- Headless mode: piped stdout, no human interaction ---
    const isStreamJson = cmd.includes('stream-json');
    let stdoutBuffer = '';

    child.stdout.on('data', (data) => {
      stdoutBuffer += data.toString();
      const lines = stdoutBuffer.split('\n');
      stdoutBuffer = lines.pop();

      for (const line of lines) {
        if (!line.trim()) continue;
        if (isStreamJson) {
          try {
            const event = JSON.parse(line);
            const summary = summarizeStreamEvent(event, agentName);
            if (summary) {
              log(`[${agentName}] ${summary}`);
              sendStatus(dispatch_id, summary);
            }
          } catch (e) {
            log(`[${agentName}] ${line.trim()}`);
          }
        } else {
          log(`[${agentName}] ${line.trim()}`);
          sendStatus(dispatch_id, line.trim());
        }
      }
    });

    child.stderr.on('data', (data) => {
      const lines = data.toString().trim().split('\n');
      for (const line of lines) {
        if (line.trim()) {
          log(`[${agentName}] STDERR: ${line}`);
          sendStatus(dispatch_id, `STDERR: ${line.trim()}`);
        }
      }
    });
  } else {
    // --- Interactive mode: visible terminal, human can interact ---
    log(`[${agentName}] Launched in interactive terminal — check your terminal`);
    sendStatus(dispatch_id, `Launched in terminal — open to interact`);
  }

  // Process exit
  child.on('close', (code) => {
    const job = runningJobs.get(dispatch_id);
    const duration = job ? Math.round((Date.now() - job.startedAt) / 1000) : 0;
    const success = code === 0;

    log(`${agentName} finished (exit ${code}, ${formatDuration(duration)}) for ${ticket.id}`);
    runningJobs.delete(dispatch_id);

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'complete',
        dispatch_id,
        success,
        exit_code: code,
        duration_seconds: duration,
      }));
    }
  });

  child.on('error', (err) => {
    const job = runningJobs.get(dispatch_id);
    const duration = job ? Math.round((Date.now() - job.startedAt) / 1000) : 0;

    log(`${agentName} spawn error after ${formatDuration(duration)}: ${err.message}`);
    runningJobs.delete(dispatch_id);

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'complete',
        dispatch_id,
        success: false,
        exit_code: -1,
        duration_seconds: duration,
      }));
    }
  });
}

// --- Claude Code stream-json event summarizer ---
function summarizeStreamEvent(event, agentName) {
  if (!event || !event.type) return null;

  switch (event.type) {
    case 'system':
      if (event.subtype === 'init') {
        const model = event.model || 'unknown';
        return `Session started (model: ${model})`;
      }
      return null; // skip other system events (hooks etc)

    case 'assistant': {
      const content = event.message?.content;
      if (!Array.isArray(content)) return null;

      const parts = [];
      for (const block of content) {
        if (block.type === 'tool_use') {
          const input = block.input || {};
          if (block.name === 'Read') {
            parts.push(`Reading: ${input.file_path || '?'}`);
          } else if (block.name === 'Bash') {
            const cmd = (input.command || '').substring(0, 80);
            parts.push(`Running: ${cmd}`);
          } else if (block.name === 'Glob') {
            parts.push(`Searching: ${input.pattern || '?'}`);
          } else if (block.name === 'Grep') {
            parts.push(`Grep: ${input.pattern || '?'}`);
          } else if (block.name === 'Edit') {
            parts.push(`Editing: ${input.file_path || '?'}`);
          } else if (block.name === 'Write') {
            parts.push(`Writing: ${input.file_path || '?'}`);
          } else if (block.name === 'Agent') {
            parts.push(`Spawning subagent: ${input.description || '?'}`);
          } else {
            parts.push(`Tool: ${block.name}`);
          }
        } else if (block.type === 'text') {
          // Truncate long text to first line
          const text = (block.text || '').split('\n')[0].substring(0, 120);
          if (text) parts.push(text);
        }
      }
      return parts.length > 0 ? parts.join(' | ') : null;
    }

    case 'user':
      return 'Tool result received — thinking...';

    case 'result': {
      const cost = event.total_cost_usd ? `$${event.total_cost_usd.toFixed(4)}` : '?';
      const duration = event.duration_ms ? `${(event.duration_ms / 1000).toFixed(1)}s` : '?';
      const turns = event.num_turns || '?';
      const status = event.subtype === 'success' ? 'SUCCESS' : 'FAILED';
      return `${status} — ${turns} turns, ${duration}, cost: ${cost}`;
    }

    default:
      return null; // skip stream_event, rate_limit_event etc
  }
}

function sendStatus(dispatchId, message) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({
    type: 'status',
    dispatch_id: dispatchId,
    message,
    timestamp: new Date().toISOString(),
  }));
}

// --- CPU monitoring for idle detection ---
const { execSync } = require('child_process');

function getProcessCpu(pid) {
  try {
    // Get CPU of process tree (parent + children)
    const output = execSync(`ps -p ${pid} -o %cpu= 2>/dev/null || echo 0`, { encoding: 'utf-8', timeout: 3000 });
    return parseFloat(output.trim()) || 0;
  } catch {
    return -1; // process doesn't exist
  }
}

// Check CPU every 5 seconds, update job state
const CPU_IDLE_THRESHOLD = 2;    // below 2% = idle
const IDLE_CONFIRM_MS = 20000;   // 20 seconds of low CPU before reporting idle

setInterval(() => {
  for (const [dispatchId, job] of runningJobs) {
    if (!job.process || !job.process.pid) continue;

    const cpu = getProcessCpu(job.process.pid);
    if (cpu < 0) continue; // process gone, will be cleaned up by close handler

    const now = Date.now();
    const wasActive = job.state === 'active';
    const wasIdle = job.state === 'idle';

    if (cpu < CPU_IDLE_THRESHOLD) {
      // CPU is low
      if (!job.idleSince) {
        job.idleSince = now;
      }
      const idleDuration = now - job.idleSince;
      if (idleDuration >= IDLE_CONFIRM_MS && wasActive) {
        // Transition: active → idle
        job.state = 'idle';
        const elapsed = Math.round((now - job.startedAt) / 1000);
        log(`[${job.agentName}] Idle — waiting for input (after ${formatDuration(elapsed)})`);
        sendStatus(dispatchId, `Idle — waiting for input (after ${formatDuration(elapsed)})`);
      }
    } else {
      // CPU is active
      if (wasIdle) {
        // Transition: idle → active
        log(`[${job.agentName}] Active again`);
        sendStatus(dispatchId, 'Active — processing');
      }
      job.state = 'active';
      job.idleSince = null;
    }
  }
}, 5000);

// --- Periodic status reporting for running jobs (every 30s) ---
setInterval(() => {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  for (const [dispatchId, job] of runningJobs) {
    const elapsed = Math.round((Date.now() - job.startedAt) / 1000);
    const stateLabel = job.state === 'idle' ? 'Idle' : 'Running';
    ws.send(JSON.stringify({
      type: 'status',
      dispatch_id: dispatchId,
      message: `${stateLabel} (${formatDuration(elapsed)})`,
      timestamp: new Date().toISOString(),
    }));
  }
}, 30000);

// --- Cleanup ---
function shutdown() {
  shuttingDown = true;
  log('Shutting down...');
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  if (statusReportTimer) clearInterval(statusReportTimer);
  if (reconnectTimer) clearTimeout(reconnectTimer);

  // Kill running jobs
  for (const [id, job] of runningJobs) {
    log(`Killing job ${id}`);
    job.process.kill('SIGTERM');
  }

  if (ws) ws.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// --- Start ---
log(`Daemon starting for machine "${MACHINE_NAME}"`);
log(`Manifest: ${manifestPath}`);
log(`Agents: ${agents.map((a) => `${a.name} [${a.tags.join(',')}]`).join(', ')}`);
connect();
