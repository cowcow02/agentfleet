const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.HUB_PORT || 9900;
const DASHBOARD_HTML = fs.readFileSync(path.join(__dirname, 'dashboard.html'), 'utf8');
const AGENT_SETUP_HTML = fs.readFileSync(path.join(__dirname, 'agent-setup.html'), 'utf8');

// --- State ---
const machines = new Map();   // machine_name -> { ws, agents: Map, lastHeartbeat }
const dispatches = [];        // ordered list of all dispatches
let dispatchCounter = 0;

// --- Logging ---
function ts() {
  return new Date().toLocaleTimeString('en-US', { hour12: false });
}
function log(msg) {
  console.log(`[HUB ${ts()}] ${msg}`);
}

// --- REST API ---
const httpServer = http.createServer((req, res) => {
  // Dashboard
  if (req.method === 'GET' && (req.url === '/' || req.url === '/dashboard')) {
    res.setHeader('Content-Type', 'text/html');
    res.writeHead(200);
    res.end(DASHBOARD_HTML);
    return;
  }

  // Agent Setup
  if (req.method === 'GET' && req.url === '/setup') {
    res.setHeader('Content-Type', 'text/html');
    res.writeHead(200);
    res.end(AGENT_SETUP_HTML);
    return;
  }

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // GET /agents
  if (req.method === 'GET' && req.url === '/agents') {
    const agents = [];
    for (const [machineName, machine] of machines) {
      for (const [agentName, agent] of machine.agents) {
        agents.push({
          machine: machineName,
          name: agentName,
          description: agent.description,
          tags: agent.tags,
          capacity: agent.capacity,
          running: agent.running,
          online: machine.ws.readyState === 1,
        });
      }
    }
    res.writeHead(200);
    res.end(JSON.stringify({ agents }, null, 2));
    return;
  }

  // GET /agents/:name
  const agentMatch = req.method === 'GET' && req.url.match(/^\/agents\/([^/]+)$/);
  if (agentMatch) {
    const name = decodeURIComponent(agentMatch[1]);
    for (const [machineName, machine] of machines) {
      const agent = machine.agents.get(name);
      if (agent) {
        res.writeHead(200);
        res.end(JSON.stringify({
          machine: machineName,
          name,
          description: agent.description,
          tags: agent.tags,
          capacity: agent.capacity,
          running: agent.running,
          online: machine.ws.readyState === 1,
        }, null, 2));
        return;
      }
    }
    res.writeHead(404);
    res.end(JSON.stringify({ error: `Agent '${name}' not found` }));
    return;
  }

  // POST /dispatch
  if (req.method === 'POST' && req.url === '/dispatch') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      let payload;
      try {
        payload = JSON.parse(body);
      } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
        return;
      }

      const ticket = payload.ticket;
      if (!ticket || !ticket.id || !ticket.labels) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'ticket.id and ticket.labels required' }));
        return;
      }

      // Find a matching agent by tag overlap
      let bestAgent = null;
      let bestMachine = null;
      let bestScore = 0;

      for (const [machineName, machine] of machines) {
        if (machine.ws.readyState !== 1) continue;
        for (const [agentName, agent] of machine.agents) {
          if (agent.running >= agent.capacity) continue;
          const overlap = agent.tags.filter((t) => ticket.labels.includes(t)).length;
          if (overlap > bestScore) {
            bestScore = overlap;
            bestAgent = agent;
            bestMachine = machineName;
          }
        }
      }

      if (!bestAgent || bestScore === 0) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'No matching agent available', labels: ticket.labels }));
        return;
      }

      dispatchCounter++;
      const dispatchId = `d-${String(dispatchCounter).padStart(3, '0')}`;
      const now = new Date().toISOString();

      const dispatch = {
        dispatch_id: dispatchId,
        agent: bestAgent.name,
        machine: bestMachine,
        ticket,
        status: 'dispatched',
        created_at: now,
        updated_at: now,
        messages: [],
      };
      dispatches.push(dispatch);
      bestAgent.running++;

      log(`Dispatch ${dispatchId}: ${ticket.id} -> ${bestMachine}/${bestAgent.name}`);

      // Send dispatch to daemon
      const machine = machines.get(bestMachine);
      if (machine && machine.ws.readyState === 1) {
        machine.ws.send(JSON.stringify({
          type: 'dispatch',
          dispatch_id: dispatchId,
          agent: bestAgent.name,
          ticket,
        }));
      }

      res.writeHead(200);
      res.end(JSON.stringify({ dispatch_id: dispatchId, agent: bestAgent.name, machine: bestMachine }));
    });
    return;
  }

  // GET /status
  if (req.method === 'GET' && req.url === '/status') {
    let totalAgents = 0;
    let totalRunning = 0;
    let onlineMachines = 0;

    for (const [, machine] of machines) {
      if (machine.ws.readyState === 1) onlineMachines++;
      for (const [, agent] of machine.agents) {
        totalAgents++;
        totalRunning += agent.running;
      }
    }

    res.writeHead(200);
    res.end(JSON.stringify({
      machines_online: onlineMachines,
      agents_registered: totalAgents,
      running_jobs: totalRunning,
      total_dispatches: dispatches.length,
    }, null, 2));
    return;
  }

  // GET /dispatches
  if (req.method === 'GET' && req.url === '/dispatches') {
    res.writeHead(200);
    res.end(JSON.stringify({ dispatches }, null, 2));
    return;
  }

  // GET /config — read daemon agents.yaml
  if (req.method === 'GET' && req.url === '/config') {
    const configPath = path.join(__dirname, '..', 'daemon', 'agents.yaml');
    try {
      const content = fs.readFileSync(configPath, 'utf8');
      res.writeHead(200);
      res.end(JSON.stringify({ path: configPath, content }));
    } catch (e) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // POST /config — write daemon agents.yaml
  if (req.method === 'POST' && req.url === '/config') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        const { content } = JSON.parse(body);
        const configPath = path.join(__dirname, '..', 'daemon', 'agents.yaml');
        fs.writeFileSync(configPath, content, 'utf8');
        log('Config updated — restart daemon to apply changes');
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true, message: 'Saved. Restart daemon to apply.' }));
      } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
});

// --- WebSocket Server ---
const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (ws) => {
  let machineName = null;

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch (e) {
      log('Bad message: ' + raw);
      return;
    }

    if (msg.type === 'register') {
      machineName = msg.machine;
      const agentMap = new Map();
      for (const a of msg.agents) {
        agentMap.set(a.name, {
          name: a.name,
          description: a.description || '',
          tags: a.tags || [],
          capacity: a.capacity || 1,
          running: 0,
        });
        log(`Agent registered: ${machineName}/${a.name} (tags: ${(a.tags || []).join(', ')})`);
      }
      machines.set(machineName, { ws, agents: agentMap, lastHeartbeat: Date.now() });
      log(`Machine "${machineName}" connected with ${msg.agents.length} agent(s)`);
      return;
    }

    if (msg.type === 'heartbeat') {
      const machine = machines.get(msg.machine);
      if (machine) {
        machine.lastHeartbeat = Date.now();
      }
      return;
    }

    if (msg.type === 'status') {
      const dispatch = dispatches.find((d) => d.dispatch_id === msg.dispatch_id);
      if (dispatch) {
        const elapsed = ((new Date(msg.timestamp) - new Date(dispatch.created_at)) / 1000).toFixed(0);
        dispatch.status = 'running';
        dispatch.updated_at = msg.timestamp;
        dispatch.messages.push({ message: msg.message, timestamp: msg.timestamp });
        log(`Status ${msg.dispatch_id}: "${msg.message}" (${elapsed}s since dispatch)`);
      }
      return;
    }

    if (msg.type === 'complete') {
      const dispatch = dispatches.find((d) => d.dispatch_id === msg.dispatch_id);
      if (dispatch) {
        dispatch.status = msg.success ? 'completed' : 'failed';
        dispatch.exit_code = msg.exit_code;
        dispatch.updated_at = new Date().toISOString();
        log(`Complete ${msg.dispatch_id}: ${dispatch.status} (exit ${msg.exit_code})`);

        // Decrement running count
        const machine = machines.get(dispatch.machine);
        if (machine) {
          const agent = machine.agents.get(dispatch.agent);
          if (agent && agent.running > 0) agent.running--;
        }
      }

      // Send ack
      ws.send(JSON.stringify({ type: 'ack', dispatch_id: msg.dispatch_id }));
      return;
    }

    log(`Unknown message type: ${msg.type}`);
  });

  ws.on('close', () => {
    if (machineName) {
      log(`Machine "${machineName}" disconnected`);
    }
  });

  ws.on('error', (err) => {
    log(`WebSocket error: ${err.message}`);
  });
});

// --- Cleanup ---
function shutdown() {
  log('Shutting down...');
  wss.close();
  httpServer.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// --- Start ---
httpServer.listen(PORT, () => {
  log(`Hub listening on http://localhost:${PORT} (HTTP + WebSocket)`);
});
