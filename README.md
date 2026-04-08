# AgentFleet

**Agent Discovery & Dispatch Platform**

AgentFleet is a self-hosted platform that connects project management tools
(Linear, Jira) to AI coding agents running on developer machines. It bridges
the gap between local agents and centralized orchestration by providing a
lightweight cloud hub that discovers, routes, and monitors agents across your
team -- without requiring agents to run in the cloud.

## Architecture

```
+-------------------+         WebSocket          +-------------------+
|                   |  <======================>  |                   |
|    Cloud Hub      |     persistent connection   |   Local Daemon    |
|   (Railway)       |                            |  (dev machine 1)  |
|                   |  <======================>  |                   |
|  - Dashboard      |                            |   Local Daemon    |
|  - API            |     persistent connection   |  (dev machine 2)  |
|  - Webhooks       |                            |                   |
+-------------------+  <======================>  +-------------------+
        ^                                                 |
        |  webhook / API                                  |  spawns
        v                                                 v
+-------------------+                            +-------------------+
|  Linear / Jira    |                            |   AI Coding Agent |
+-------------------+                            +-------------------+
```

## Features

- **Multi-tenant teams** -- isolated workspaces with token-based auth
- **Agent discovery** -- daemons register on connect; hub tracks availability
- **Tag-based routing** -- dispatch work to agents by language, repo, or custom tags
- **Linear / Jira integration** -- ingest issues via webhook, proxy API calls
- **Real-time dashboard** -- monitor agents, dispatches, and team activity
- **CLI tool** -- manage agents and configuration from the terminal

## Quick Start

1. **Deploy the hub**

   ```
   railway up
   ```

   Or run with Docker:

   ```
   docker run -p 3000:3000 agentfleet/hub
   ```

2. **Create a team** -- visit your hub URL and follow the setup flow.

3. **Install the CLI**

   ```
   npm install -g agentfleet
   ```

   Or from source:

   ```
   git clone https://github.com/your-org/agentfleet.git
   cd agentfleet/cli && npm link
   ```

4. **Login**

   ```
   agentfleet login <token> --hub <url>
   ```

5. **Configure agents**

   ```
   agentfleet setup
   ```

6. **Start the daemon**

   ```
   agentfleet start
   ```

## Project Structure

```
hub/               Cloud hub server (Node.js + WebSocket)
cli/               Command-line interface
prototype/daemon/  Early daemon prototype
docs/              Design documents and specs
research/          Background research and notes
```

## Tech Stack

- **Runtime**: Node.js
- **Real-time**: WebSocket (ws)
- **Frontend**: Vanilla HTML / CSS / JS (no build step)

## Hub Pages

| Page        | Path              | Description                          |
|-------------|-------------------|--------------------------------------|
| Landing     | `/`               | Team creation and login              |
| Dashboard   | `/dashboard.html` | Overview of team activity            |
| Agents      | `/agents.html`    | Connected agents and their status    |
| Dispatches  | `/dispatches.html`| Work items routed to agents          |
| Settings    | `/settings.html`  | Team configuration and integrations  |

## CLI Commands

| Command             | Description                              |
|---------------------|------------------------------------------|
| `agentfleet login`  | Authenticate with a hub instance         |
| `agentfleet status` | Show connection and agent status         |
| `agentfleet agents` | List registered agents                   |
| `agentfleet setup`  | Interactive agent configuration          |
| `agentfleet start`  | Start the local daemon                   |
| `agentfleet help`   | Print usage information                  |

## Linear Integration

AgentFleet integrates with Linear through two mechanisms:

- **Webhook receiver** -- the hub accepts Linear webhook events (issue created,
  updated, etc.) and routes them to the appropriate agent based on tags and
  team configuration.
- **API proxy** -- the hub proxies Linear API calls from agents, keeping API
  tokens centralized and out of individual developer machines.

Configure the integration in the Settings page of your hub dashboard.

## Contributing

Contributions are welcome. Please open an issue to discuss your idea before
submitting a pull request. Keep changes focused and include a clear description
of what the change does and why.

## License

MIT
