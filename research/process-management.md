# Process Management on macOS/Linux Research

## 1. macOS Auto-Start: launchd LaunchAgent

### LaunchAgent Plist Template

The daemon should install a LaunchAgent plist to `~/Library/LaunchAgents/`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.agentfleet.daemon</string>

  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>/usr/local/lib/agentfleet/daemon.js</string>
  </array>

  <key>RunAtLoad</key>
  <true/>

  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>

  <key>WorkingDirectory</key>
  <string>/usr/local/lib/agentfleet</string>

  <key>StandardOutPath</key>
  <string>/usr/local/var/log/agentfleet/daemon.stdout.log</string>

  <key>StandardErrorPath</key>
  <string>/usr/local/var/log/agentfleet/daemon.stderr.log</string>

  <key>EnvironmentVariables</key>
  <dict>
    <key>NODE_ENV</key>
    <string>production</string>
    <key>AGENTFLEET_CONFIG</key>
    <string>~/.agentfleet/config.yaml</string>
  </dict>

  <key>ThrottleInterval</key>
  <integer>10</integer>

  <key>ProcessType</key>
  <string>Background</string>
</dict>
</plist>
```

**Key properties explained:**

| Property | Value | Purpose |
|---|---|---|
| `Label` | `com.agentfleet.daemon` | Unique identifier (reverse DNS) |
| `RunAtLoad` | `true` | Start on user login |
| `KeepAlive.SuccessfulExit=false` | Restart only on crash, not clean exit | Allows `agentfleet stop` to actually stop |
| `ThrottleInterval` | `10` | Min seconds between restart attempts (prevents crash loops) |
| `ProcessType` | `Background` | Lower CPU priority, battery-friendly |
| `StandardOutPath/ErrorPath` | Log files | Separate stdout/stderr for debugging |

### Programmatic Install/Uninstall

```typescript
import { execSync, spawn } from 'node:child_process';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const PLIST_NAME = 'com.agentfleet.daemon.plist';
const PLIST_PATH = path.join(homedir(), 'Library/LaunchAgents', PLIST_NAME);
const LABEL = 'com.agentfleet.daemon';

function installLaunchAgent(nodePath: string, daemonPath: string) {
  const plist = generatePlist(nodePath, daemonPath); // generates XML above
  writeFileSync(PLIST_PATH, plist);

  // Load the agent
  execSync(`launchctl load ${PLIST_PATH}`);
}

function uninstallLaunchAgent() {
  // Unload first (stops the process)
  try {
    execSync(`launchctl unload ${PLIST_PATH}`);
  } catch {
    // May already be unloaded
  }

  // Remove plist file
  if (existsSync(PLIST_PATH)) {
    unlinkSync(PLIST_PATH);
  }
}

function isRunning(): boolean {
  try {
    const output = execSync(`launchctl list ${LABEL}`, { encoding: 'utf-8' });
    // If the command succeeds, the service is loaded
    // Check for PID in the output
    return !output.includes('"PID" = 0') && output.includes('"PID"');
  } catch {
    return false;
  }
}

function startDaemon() {
  execSync(`launchctl start ${LABEL}`);
}

function stopDaemon() {
  execSync(`launchctl stop ${LABEL}`);
}
```

### Modern macOS (13+) Considerations

Starting with macOS Ventura, Apple introduced `launchctl bootstrap` and `launchctl bootout` as preferred alternatives to `load`/`unload`:

```bash
# Load (modern)
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.agentfleet.daemon.plist

# Unload (modern)
launchctl bootout gui/$(id -u)/com.agentfleet.daemon

# Check status
launchctl print gui/$(id -u)/com.agentfleet.daemon
```

**Recommendation:** Use `launchctl load/unload` for now -- it works on all macOS versions and the deprecation is soft. Optionally detect macOS version and use bootstrap/bootout on 13+.

## 2. Linux Auto-Start: systemd User Service

### Systemd Unit File

Install to `~/.config/systemd/user/agentfleet-daemon.service`:

```ini
[Unit]
Description=AgentFleet Daemon
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/bin/node /usr/local/lib/agentfleet/daemon.js
WorkingDirectory=/usr/local/lib/agentfleet
Restart=on-failure
RestartSec=10
Environment=NODE_ENV=production
Environment=AGENTFLEET_CONFIG=%h/.agentfleet/config.yaml

# Logging to journal
StandardOutput=journal
StandardError=journal
SyslogIdentifier=agentfleet

# Resource limits
MemoryMax=1G
CPUQuota=50%

[Install]
WantedBy=default.target
```

**Key properties:**

| Property | Value | Purpose |
|---|---|---|
| `Type=simple` | Process is the main process | Not forking, not oneshot |
| `Restart=on-failure` | Restart on crash, not on clean exit | Same as launchd KeepAlive pattern |
| `RestartSec=10` | Wait 10s before restart | Prevents crash loops |
| `WantedBy=default.target` | User-level default target | Starts on user login |
| `%h` | Home directory variable | Expands to user's home |
| `MemoryMax/CPUQuota` | Resource limits | Prevents daemon from consuming everything |

### Programmatic Install/Enable/Start

```typescript
import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync, unlinkSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const SERVICE_NAME = 'agentfleet-daemon';
const SERVICE_DIR = path.join(homedir(), '.config/systemd/user');
const SERVICE_PATH = path.join(SERVICE_DIR, `${SERVICE_NAME}.service`);

function installSystemdService(nodePath: string, daemonPath: string) {
  // Ensure directory exists
  mkdirSync(SERVICE_DIR, { recursive: true });

  const unit = generateUnitFile(nodePath, daemonPath); // generates INI above
  writeFileSync(SERVICE_PATH, unit);

  // Reload systemd to pick up new unit
  execSync('systemctl --user daemon-reload');

  // Enable (start on login)
  execSync(`systemctl --user enable ${SERVICE_NAME}`);

  // Enable lingering (so service runs even when user is not logged in via GUI)
  execSync(`loginctl enable-linger $(whoami)`);
}

function uninstallSystemdService() {
  try {
    execSync(`systemctl --user stop ${SERVICE_NAME}`);
    execSync(`systemctl --user disable ${SERVICE_NAME}`);
  } catch {
    // May already be stopped/disabled
  }

  if (existsSync(SERVICE_PATH)) {
    unlinkSync(SERVICE_PATH);
  }

  execSync('systemctl --user daemon-reload');
}

function isRunning(): boolean {
  try {
    const output = execSync(
      `systemctl --user is-active ${SERVICE_NAME}`,
      { encoding: 'utf-8' }
    ).trim();
    return output === 'active';
  } catch {
    return false;
  }
}

function startDaemon() {
  execSync(`systemctl --user start ${SERVICE_NAME}`);
}

function stopDaemon() {
  execSync(`systemctl --user stop ${SERVICE_NAME}`);
}

function viewLogs() {
  // Journal logging
  execSync(`journalctl --user -u ${SERVICE_NAME} -f`, { stdio: 'inherit' });
}
```

### Important: `loginctl enable-linger`

Without linger enabled, user-level systemd services stop when the user's last session ends (e.g., SSH disconnect). `enable-linger` keeps the user's service manager running permanently. This is essential for headless servers.

## 3. Cross-Platform Service Manager

```typescript
import { platform } from 'node:os';

interface ServiceManager {
  install(nodePath: string, daemonPath: string): void;
  uninstall(): void;
  start(): void;
  stop(): void;
  isRunning(): boolean;
}

function getServiceManager(): ServiceManager {
  switch (platform()) {
    case 'darwin':
      return new LaunchdServiceManager();
    case 'linux':
      return new SystemdServiceManager();
    default:
      throw new Error(`Unsupported platform: ${platform()}`);
  }
}
```

## 4. Child Process Spawning for Agents

### Spawning Agent CLI Processes

```typescript
import { spawn, ChildProcess } from 'node:child_process';

interface AgentProcess {
  child: ChildProcess;
  ticketId: string;
  agentId: string;
  worktreePath: string;
  startedAt: Date;
}

function spawnAgent(config: {
  command: string;           // e.g., 'claude'
  args: string[];            // e.g., ['-p', prompt, '--output-format', 'stream-json']
  cwd: string;               // worktree path
  env?: Record<string, string>;
}): ChildProcess {
  const child = spawn(config.command, config.args, {
    cwd: config.cwd,
    env: { ...process.env, ...config.env },
    stdio: ['pipe', 'pipe', 'pipe'],
    // Critical: create a new process group for cleanup
    detached: false,
  });

  // Pipe stdout for monitoring (NDJSON for Claude Code)
  child.stdout?.on('data', (chunk: Buffer) => {
    const lines = chunk.toString().split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const event = JSON.parse(line);
        handleAgentEvent(event);
      } catch {
        // Not JSON -- log as plain text
      }
    }
  });

  // Capture stderr for error reporting
  child.stderr?.on('data', (chunk: Buffer) => {
    console.error(`[agent:${config.command}] ${chunk.toString()}`);
  });

  child.on('exit', (code, signal) => {
    console.log(`Agent exited: code=${code} signal=${signal}`);
    // Report completion/failure to hub
  });

  return child;
}
```

### Process Group Management and Graceful Shutdown

On daemon shutdown, all spawned agent processes must be terminated:

```typescript
class ProcessPool {
  private processes = new Map<string, AgentProcess>();

  add(id: string, proc: AgentProcess) {
    this.processes.set(id, proc);
  }

  remove(id: string) {
    this.processes.delete(id);
  }

  // Graceful shutdown: SIGTERM with timeout, then SIGKILL
  async shutdownAll(timeoutMs: number = 10_000): Promise<void> {
    const shutdowns = Array.from(this.processes.entries()).map(
      ([id, proc]) => this.shutdownOne(id, proc, timeoutMs)
    );
    await Promise.allSettled(shutdowns);
  }

  private async shutdownOne(id: string, proc: AgentProcess, timeoutMs: number): Promise<void> {
    return new Promise((resolve) => {
      const child = proc.child;

      if (child.killed || child.exitCode !== null) {
        this.remove(id);
        resolve();
        return;
      }

      const killTimer = setTimeout(() => {
        // Force kill if SIGTERM did not work
        try {
          // On Linux, kill the process group
          if (process.platform === 'linux') {
            process.kill(-child.pid!, 'SIGKILL');
          } else {
            child.kill('SIGKILL');
          }
        } catch {
          // Process may already be gone
        }
        this.remove(id);
        resolve();
      }, timeoutMs);

      child.on('exit', () => {
        clearTimeout(killTimer);
        this.remove(id);
        resolve();
      });

      // Send SIGTERM first
      child.kill('SIGTERM');
    });
  }
}

// Handle daemon shutdown signals
const processPool = new ProcessPool();

process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down agents...');
  await processPool.shutdownAll();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down agents...');
  await processPool.shutdownAll();
  process.exit(0);
});
```

### Killing Child Process Trees

On macOS, `child.kill()` only kills the direct child. If the agent spawns sub-processes, they become orphans. Solution:

```typescript
import { execSync } from 'node:child_process';

// Kill entire process tree on macOS
function killProcessTree(pid: number, signal: string = 'SIGTERM') {
  if (process.platform === 'darwin') {
    // Use pkill to kill process group
    try {
      execSync(`pkill -${signal.replace('SIG', '')} -P ${pid}`);
    } catch {
      // No children -- ignore
    }
    process.kill(pid, signal as NodeJS.Signals);
  } else if (process.platform === 'linux') {
    // Kill the process group (negative PID)
    try {
      process.kill(-pid, signal as NodeJS.Signals);
    } catch {
      process.kill(pid, signal as NodeJS.Signals);
    }
  }
}
```

**Alternative:** Use `tree-kill` npm package, which handles cross-platform process tree termination.

## 5. Process Resource Monitoring with pidusage

```typescript
import pidusage from 'pidusage';

interface ProcessStats {
  cpu: number;      // CPU percentage
  memory: number;   // Memory in bytes
  elapsed: number;  // Elapsed time since start in ms
}

// Monitor a single agent process
async function getProcessStats(pid: number): Promise<ProcessStats> {
  const stats = await pidusage(pid);
  return {
    cpu: stats.cpu,
    memory: stats.memory,
    elapsed: stats.elapsed,
  };
}

// Monitor all running agents periodically
class AgentMonitor {
  private intervalId: NodeJS.Timeout | null = null;

  start(processPool: ProcessPool, intervalMs: number = 5_000) {
    this.intervalId = setInterval(async () => {
      for (const [id, proc] of processPool.entries()) {
        try {
          const stats = await pidusage(proc.child.pid!);
          // Report to hub via WebSocket
          reportStatus({
            agentId: id,
            ticketId: proc.ticketId,
            cpu: stats.cpu,
            memoryMb: Math.round(stats.memory / 1024 / 1024),
            elapsedMs: stats.elapsed,
          });
        } catch {
          // Process may have exited -- ignore
        }
      }
    }, intervalMs);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    pidusage.clear(); // Clean up pidusage internal state
  }
}
```

**pidusage details:**
- Cross-platform (macOS, Linux, Windows)
- Uses `/proc` filesystem on Linux (fast, no subprocess)
- Uses `ps` on macOS (slightly slower, but reliable)
- Returns: `cpu` (percentage), `memory` (bytes), `ppid`, `pid`, `ctime`, `elapsed`, `timestamp`
- Supports monitoring multiple PIDs in a single call: `pidusage([pid1, pid2, pid3])`

## 6. Git Worktree Management

### Creating Worktrees for Agent Tasks

```typescript
import { execSync } from 'node:child_process';
import path from 'node:path';

const WORKTREE_BASE = path.join(homedir(), '.agentfleet/worktrees');

interface WorktreeInfo {
  path: string;
  branch: string;
}

function createWorktree(
  repoPath: string,
  ticketId: string,
  baseBranch: string = 'main'
): WorktreeInfo {
  // Sanitize ticket ID for branch/dir name
  const safeName = ticketId.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const branchName = `agentfleet/${safeName}`;
  const worktreePath = path.join(WORKTREE_BASE, safeName);

  // Fetch latest
  execSync('git fetch origin', { cwd: repoPath, stdio: 'pipe' });

  // Create worktree with new branch from the base
  execSync(
    `git worktree add -b ${branchName} ${worktreePath} origin/${baseBranch}`,
    { cwd: repoPath, stdio: 'pipe' }
  );

  return { path: worktreePath, branch: branchName };
}

function removeWorktree(repoPath: string, worktreePath: string): void {
  execSync(`git worktree remove ${worktreePath} --force`, {
    cwd: repoPath,
    stdio: 'pipe',
  });
}

function cleanupWorktrees(repoPath: string): void {
  // Prune stale worktree references
  execSync('git worktree prune', { cwd: repoPath, stdio: 'pipe' });
}

function listWorktrees(repoPath: string): string[] {
  const output = execSync('git worktree list --porcelain', {
    cwd: repoPath,
    encoding: 'utf-8',
  });

  return output
    .split('\n')
    .filter((line) => line.startsWith('worktree '))
    .map((line) => line.replace('worktree ', ''));
}
```

### Worktree Directory Convention

```
~/.agentfleet/worktrees/
  proj-123/           # One worktree per ticket
  proj-124/
  proj-125/
```

### Worktree Lifecycle

```
1. Ticket dispatched to agent
2. createWorktree() -- creates isolated copy
3. Agent spawned in worktree directory
4. Agent works (commits, etc.)
5. Agent completes (PR created)
6. removeWorktree() -- cleanup
7. git worktree prune -- remove stale references
```

### Dependency Installation in Worktrees

Worktrees share `.git` but not `node_modules`. For Node.js projects, install dependencies:

```typescript
function setupWorktree(worktreePath: string): void {
  // Check if package.json exists
  if (existsSync(path.join(worktreePath, 'package.json'))) {
    // Use the project's preferred package manager
    const lockFiles = {
      'pnpm-lock.yaml': 'pnpm install --frozen-lockfile',
      'yarn.lock': 'yarn install --frozen-lockfile',
      'package-lock.json': 'npm ci',
    };

    for (const [lockFile, command] of Object.entries(lockFiles)) {
      if (existsSync(path.join(worktreePath, lockFile))) {
        execSync(command, { cwd: worktreePath, stdio: 'pipe' });
        break;
      }
    }
  }
}
```

## 7. Claude Code Specific Integration

### Spawning Claude Code with stream-json

```typescript
function spawnClaudeCode(config: {
  prompt: string;
  cwd: string;
  sessionId?: string;
  maxBudgetUsd?: number;
}): ChildProcess {
  const args = [
    '-p', config.prompt,
    '--output-format', 'stream-json',
    '--verbose',
    '--permission-mode', 'auto',
  ];

  if (config.sessionId) {
    args.push('--session-id', config.sessionId);
  }

  if (config.maxBudgetUsd) {
    args.push('--max-budget-usd', config.maxBudgetUsd.toString());
  }

  return spawn('claude', args, {
    cwd: config.cwd,
    env: {
      ...process.env,
      // Ensure Claude Code does not try to open a browser
      BROWSER: 'none',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}
```

### NDJSON Stream Parsing

Claude Code with `--output-format stream-json --verbose` emits newline-delimited JSON events on stdout:

```typescript
import { createInterface } from 'node:readline';

function parseClaudeStream(child: ChildProcess, callbacks: {
  onAssistant?: (text: string) => void;
  onToolUse?: (tool: string, input: any) => void;
  onToolResult?: (tool: string, output: any) => void;
  onTokenUsage?: (input: number, output: number) => void;
  onComplete?: (result: any) => void;
  onError?: (error: any) => void;
}) {
  const rl = createInterface({
    input: child.stdout!,
    crlfDelay: Infinity,
  });

  rl.on('line', (line) => {
    if (!line.trim()) return;

    try {
      const event = JSON.parse(line);

      switch (event.type) {
        case 'assistant':
          // Text content from Claude
          if (event.message?.content) {
            for (const block of event.message.content) {
              if (block.type === 'text') {
                callbacks.onAssistant?.(block.text);
              } else if (block.type === 'tool_use') {
                callbacks.onToolUse?.(block.name, block.input);
              }
            }
          }
          break;

        case 'tool_result':
        case 'result':
          callbacks.onToolResult?.(event.tool, event.content);
          break;

        case 'usage':
          callbacks.onTokenUsage?.(
            event.usage?.input_tokens || 0,
            event.usage?.output_tokens || 0
          );
          break;

        case 'system':
          if (event.subtype === 'complete') {
            callbacks.onComplete?.(event);
          }
          break;

        case 'error':
          callbacks.onError?.(event);
          break;
      }
    } catch {
      // Not valid JSON -- may be a partial line or debug output
    }
  });

  rl.on('close', () => {
    // Stream ended -- process exiting
  });
}
```

### Alternative: claude-code-parser Package

For robust parsing that handles edge cases (verbose mode deduplication, multi-agent interleaving, double-encoded fields):

```typescript
// npm install claude-code-parser
import { parseStream } from 'claude-code-parser';

const events = parseStream(child.stdout!);
for await (const event of events) {
  // Fully typed, deduplicated events
  console.log(event.type, event);
}
```

This is a zero-dependency 11 KB package purpose-built for this exact use case.

### Claude Code CLI Flags Reference

| Flag | Value | Purpose |
|---|---|---|
| `--output-format` | `stream-json` | NDJSON event stream on stdout |
| `--verbose` | (flag) | Include tool_use, tool_result events |
| `--include-partial-messages` | (flag) | Token-by-token streaming (high volume) |
| `--session-id` | UUID | Resume or namespace a session |
| `--max-budget-usd` | number | Cost cap per session |
| `--permission-mode` | `auto` | Auto-approve file edits, command execution |
| `-p` | string | Prompt (non-interactive mode) |
| `--input-format` | `stream-json` | Accept NDJSON on stdin for multi-turn |

## Dependencies

```
pidusage               # Process CPU/memory monitoring
tree-kill              # Cross-platform process tree killing (optional)
claude-code-parser     # NDJSON stream parser for Claude Code (optional)
```

## Sources

- [Creating Launch Daemons and Agents - Apple](https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/CreatingLaunchdJobs.html)
- [A launchd Tutorial](https://www.launchd.info/)
- [Launch a Node Script at Boot on macOS](https://dev.to/mjehanno/launch-a-node-script-at-boot-on-macos-1dnd)
- [Running Node.js on Linux with systemd - CloudBees](https://www.cloudbees.com/blog/running-node-js-linux-systemd)
- [Running Your Node.js App with Systemd - NodeSource](https://nodesource.com/blog/running-your-node-js-app-with-systemd-part-1)
- [Node.js child_process Documentation](https://nodejs.org/api/child_process.html)
- [Killing Process Families with Node](https://medium.com/@almenon214/killing-processes-with-node-772ffdd19aad)
- [pidusage - GitHub](https://github.com/soyuka/pidusage)
- [Git Worktree Documentation](https://git-scm.com/docs/git-worktree)
- [Git Worktrees for Parallel AI Coding Agents](https://devcenter.upsun.com/posts/git-worktrees-for-parallel-ai-coding-agents/)
- [pnpm + Git Worktrees for Multi-Agent Development](https://pnpm.io/next/git-worktrees)
- [claude-code-parser - awesome-claude-code](https://github.com/hesreallyhim/awesome-claude-code/issues/1046)
- [Claude Code stream-json documentation issue](https://github.com/anthropics/claude-code/issues/24594)
