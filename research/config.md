# YAML Config Parsing Research

## Config File Architecture

AgentFleet has two config files:

1. **Daemon config** (`~/.agentfleet/config.yaml`) -- per-machine settings: hub URL, machine identity, agent manifest
2. **Hub config** (`~/.agentfleet/hub.yaml` or env vars) -- server settings: port, database path, webhook secrets

## YAML Parsing: js-yaml (yaml npm package)

The `yaml` package (formerly js-yaml, now maintained as `yaml`) is the standard Node.js YAML parser:

```typescript
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { readFileSync } from 'node:fs';

const raw = readFileSync('~/.agentfleet/config.yaml', 'utf-8');
const config = parseYaml(raw);
```

**Why `yaml` over `js-yaml`:** The `yaml` package (npm: `yaml`) is the maintained successor. It supports YAML 1.2, has TypeScript types, and handles edge cases better. `js-yaml` works too but has not seen significant updates.

## Schema Validation with Zod

Parse YAML into an untyped object, then validate with Zod for full type safety:

### Daemon Config Schema

```typescript
import { z } from 'zod';

const AgentSchema = z.object({
  name: z.string().min(1),
  tags: z.array(z.string()).min(1),
  maxConcurrent: z.number().int().min(1).max(10).default(1),
  command: z.string().default('claude'),
  args: z.array(z.string()).default([]),
  env: z.record(z.string()).optional(),
  workingDir: z.string().optional(),
  maxBudgetUsd: z.number().positive().optional(),
  permissionMode: z.enum(['auto', 'default']).default('auto'),
});

const DaemonConfigSchema = z.object({
  version: z.literal(1),

  hub: z.object({
    url: z.string().url(),
    machineId: z.string().min(1).optional(),  // Auto-generated if not set
    apiKey: z.string().min(1).optional(),      // Can also come from keychain
  }),

  machine: z.object({
    name: z.string().min(1).optional(),  // Defaults to hostname
    labels: z.array(z.string()).default([]),
  }).default({}),

  agents: z.array(AgentSchema).min(1),

  worktrees: z.object({
    baseDir: z.string().default('~/.agentfleet/worktrees'),
    cleanup: z.enum(['always', 'on-success', 'never']).default('on-success'),
    installDeps: z.boolean().default(true),
  }).default({}),

  logging: z.object({
    level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    dir: z.string().default('~/.agentfleet/logs'),
  }).default({}),
});

type DaemonConfig = z.infer<typeof DaemonConfigSchema>;
```

### Example Daemon Config File

```yaml
version: 1

hub:
  url: wss://hub.example.com
  # apiKey: stored in system keychain, not in config file

machine:
  name: alice-macbook
  labels:
    - macos
    - m2

agents:
  - name: backend
    tags: [backend, node, api]
    maxConcurrent: 2
    command: claude
    args: ["-p", "--output-format", "stream-json", "--verbose", "--permission-mode", "auto"]
    maxBudgetUsd: 5.00

  - name: frontend
    tags: [frontend, react, ui]
    maxConcurrent: 1
    command: claude
    maxBudgetUsd: 3.00

  - name: docs
    tags: [docs, markdown]
    maxConcurrent: 1
    command: claude
    maxBudgetUsd: 1.00

worktrees:
  baseDir: ~/.agentfleet/worktrees
  cleanup: on-success
  installDeps: true

logging:
  level: info
```

### Hub Config Schema

```typescript
const HubConfigSchema = z.object({
  version: z.literal(1),

  server: z.object({
    port: z.number().int().min(1).max(65535).default(3001),
    host: z.string().default('0.0.0.0'),
  }).default({}),

  database: z.object({
    path: z.string().default('./data/agentfleet.db'),
  }).default({}),

  auth: z.object({
    teamName: z.string().min(1),
    // teamToken: generated on first run, stored in DB
  }),

  integrations: z.object({
    jira: z.object({
      enabled: z.boolean().default(false),
      url: z.string().url().optional(),
      email: z.string().email().optional(),
      apiToken: z.string().optional(),           // Or use env: JIRA_API_TOKEN
      webhookSecret: z.string().optional(),       // Or use env: JIRA_WEBHOOK_SECRET
    }).default({ enabled: false }),

    linear: z.object({
      enabled: z.boolean().default(false),
      apiKey: z.string().optional(),              // Or use env: LINEAR_API_KEY
      webhookSecret: z.string().optional(),       // Or use env: LINEAR_WEBHOOK_SECRET
    }).default({ enabled: false }),

    github: z.object({
      enabled: z.boolean().default(false),
      token: z.string().optional(),               // Or use env: GITHUB_TOKEN
      webhookSecret: z.string().optional(),       // Or use env: GITHUB_WEBHOOK_SECRET
    }).default({ enabled: false }),
  }).default({}),

  dispatch: z.object({
    rules: z.array(z.object({
      source: z.enum(['jira', 'linear', 'github', '*']).default('*'),
      matchLabels: z.array(z.string()).optional(),
      matchProject: z.string().optional(),
      agentTag: z.string(),
      priority: z.number().int().default(0),
    })).default([]),
  }).default({}),
});
```

## Config File Location Conventions

### Recommended: `~/.agentfleet/`

| Platform | Path | Notes |
|---|---|---|
| macOS | `~/.agentfleet/config.yaml` | Standard for CLI tools on macOS |
| Linux | `~/.agentfleet/config.yaml` | Simpler than XDG for a single tool |
| Linux (XDG) | `$XDG_CONFIG_HOME/agentfleet/config.yaml` | More "correct" but harder to discover |

**Recommendation: `~/.agentfleet/`** as the default, with `XDG_CONFIG_HOME` support as a fallback on Linux.

```typescript
import { homedir } from 'node:os';
import path from 'node:path';

function getConfigDir(): string {
  // 1. Explicit env var override
  if (process.env.AGENTFLEET_CONFIG_DIR) {
    return process.env.AGENTFLEET_CONFIG_DIR;
  }

  // 2. XDG on Linux
  if (process.platform === 'linux' && process.env.XDG_CONFIG_HOME) {
    return path.join(process.env.XDG_CONFIG_HOME, 'agentfleet');
  }

  // 3. Default: ~/.agentfleet/
  return path.join(homedir(), '.agentfleet');
}

function getConfigPath(): string {
  return path.join(getConfigDir(), 'config.yaml');
}
```

### Directory Structure

```
~/.agentfleet/
  config.yaml           # Daemon configuration
  worktrees/            # Git worktrees for active tasks
    proj-123/
    proj-124/
  logs/                 # Daemon log files
    daemon.log
    agent-backend.log
  data/                 # (Hub only) Database
    agentfleet.db
```

## Config File Watching (Auto-Reload)

Use `fs.watch` (built-in) rather than `chokidar` to avoid an additional dependency:

```typescript
import { watch, readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { debounce } from './utils';

class ConfigWatcher {
  private config: DaemonConfig;
  private watcher: ReturnType<typeof watch> | null = null;
  private configPath: string;
  private listeners: Array<(config: DaemonConfig) => void> = [];

  constructor(configPath: string) {
    this.configPath = configPath;
    this.config = this.loadAndValidate();
  }

  private loadAndValidate(): DaemonConfig {
    const raw = readFileSync(this.configPath, 'utf-8');
    const parsed = parseYaml(raw);
    return DaemonConfigSchema.parse(parsed);
  }

  start() {
    // Debounce: editors may trigger multiple events on save
    const reload = debounce(() => {
      try {
        const newConfig = this.loadAndValidate();
        this.config = newConfig;
        console.log('Config reloaded successfully');
        for (const listener of this.listeners) {
          listener(newConfig);
        }
      } catch (err) {
        console.error('Config reload failed (keeping old config):', err);
      }
    }, 500);

    this.watcher = watch(this.configPath, (eventType) => {
      if (eventType === 'change') {
        reload();
      }
    });
  }

  stop() {
    this.watcher?.close();
  }

  get current(): DaemonConfig {
    return this.config;
  }

  onChange(listener: (config: DaemonConfig) => void) {
    this.listeners.push(listener);
  }
}
```

**Why not chokidar:** `fs.watch` works reliably on macOS and Linux for watching a single known file. Chokidar is valuable for watching directory trees or handling cross-platform edge cases with file patterns. For a single config file, `fs.watch` is sufficient and avoids a 30M-download dependency.

**Debouncing:** Text editors (VS Code, Vim) often trigger multiple file system events when saving. The 500ms debounce prevents reloading mid-write.

**Error handling:** If the new config is invalid (Zod parse fails), keep the old config and log the error. Never crash on config reload.

## Environment Variable Interpolation in YAML

Secrets should not be in YAML files. Support environment variable references:

```yaml
hub:
  url: wss://hub.example.com
  apiKey: ${AGENTFLEET_API_KEY}    # Resolved from environment

integrations:
  jira:
    apiToken: ${JIRA_API_TOKEN}
    webhookSecret: ${JIRA_WEBHOOK_SECRET}
```

### Implementation

```typescript
function interpolateEnvVars(yamlString: string): string {
  return yamlString.replace(/\$\{([^}]+)\}/g, (match, varName) => {
    const value = process.env[varName.trim()];
    if (value === undefined) {
      throw new Error(`Environment variable ${varName} is not set (referenced in config)`);
    }
    return value;
  });
}

function loadConfig(configPath: string): DaemonConfig {
  const raw = readFileSync(configPath, 'utf-8');
  const interpolated = interpolateEnvVars(raw);
  const parsed = parseYaml(interpolated);
  return DaemonConfigSchema.parse(parsed);
}
```

**Design decisions:**
- `${VAR}` syntax (same as Docker Compose, shell, most config tools)
- Throws on missing env var rather than silently inserting empty string
- Interpolation happens before YAML parsing, so it works with any YAML value type
- Only `${VAR}` is supported, not `$VAR` (avoids ambiguity)

## Team Config vs Personal Config (Extending/Merging)

For teams that want shared base configurations:

```yaml
# ~/.agentfleet/config.yaml (personal)
version: 1
extends: https://raw.githubusercontent.com/org/agentfleet-config/main/team.yaml

hub:
  url: wss://hub.internal.company.com

# Personal overrides:
agents:
  - name: backend
    tags: [backend, node]
    maxConcurrent: 3  # I have a beefy machine
```

### Merge Strategy

```typescript
import deepmerge from 'deepmerge';

async function loadConfigWithExtends(configPath: string): Promise<DaemonConfig> {
  const personal = parseYaml(readFileSync(configPath, 'utf-8'));

  if (personal.extends) {
    let baseConfig: any;

    if (personal.extends.startsWith('http')) {
      // Fetch remote team config
      const response = await fetch(personal.extends);
      baseConfig = parseYaml(await response.text());
    } else {
      // Local file reference
      baseConfig = parseYaml(readFileSync(personal.extends, 'utf-8'));
    }

    // Deep merge: personal overrides base
    // Arrays are replaced, not concatenated (agents list is personal)
    const merged = deepmerge(baseConfig, personal, {
      arrayMerge: (_target, source) => source, // Replace arrays
    });

    delete merged.extends;
    return DaemonConfigSchema.parse(merged);
  }

  return DaemonConfigSchema.parse(personal);
}
```

**Recommendation for MVP:** Skip the `extends` feature initially. It adds complexity (remote fetching, merge semantics, cache invalidation). Teams can share configs via a git repo and copy/adapt locally.

## CLI Init Command

Generate a starter config interactively:

```typescript
// agentfleet init
async function initConfig() {
  const configDir = getConfigDir();
  const configPath = getConfigPath();

  if (existsSync(configPath)) {
    console.log(`Config already exists at ${configPath}`);
    return;
  }

  mkdirSync(configDir, { recursive: true });

  const config = `version: 1

hub:
  url: wss://your-hub-url.example.com
  # API key is stored in your system keychain after 'agentfleet login'

machine:
  name: ${hostname()}

agents:
  - name: default
    tags: [general]
    maxConcurrent: 1
    command: claude
    maxBudgetUsd: 5.00

worktrees:
  baseDir: ${path.join(configDir, 'worktrees')}
  cleanup: on-success

logging:
  level: info
`;

  writeFileSync(configPath, config);
  console.log(`Config created at ${configPath}`);
  console.log('Edit it to configure your agents and hub URL.');
}
```

## Dependencies

```
yaml                    # YAML parsing (v2+)
zod                     # Schema validation
```

Optional:
```
deepmerge               # Config merging (only if extends feature is built)
```

## Sources

- [Zod Documentation](https://zod.dev/)
- [Zod GitHub](https://github.com/colinhacks/zod)
- [zod-config - GitHub](https://github.com/alexmarqs/zod-config)
- [Parsing YAML in TypeScript - Medium](https://medium.com/@sangimed/typescript-parsing-a-yaml-file-the-right-way-0240b75917af)
- [A Complete Guide to Zod - Better Stack](https://betterstack.com/community/guides/scaling-nodejs/zod-explained/)
- [chokidar - GitHub](https://github.com/paulmillr/chokidar)
