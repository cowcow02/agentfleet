#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
HUB_PID=""
DAEMON_PID=""
HUB_LOG="$DIR/.hub.log"
DAEMON_LOG="$DIR/.daemon.log"

# Colors
BOLD='\033[1m'
DIM='\033[2m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m'

cleanup() {
  echo ""
  [ -n "$DAEMON_PID" ] && kill "$DAEMON_PID" 2>/dev/null
  [ -n "$HUB_PID" ] && kill "$HUB_PID" 2>/dev/null
  wait 2>/dev/null
  rm -f "$HUB_LOG" "$DAEMON_LOG"
}
trap cleanup EXIT

header() {
  echo ""
  echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BOLD}  $1${NC}"
  echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

step() {
  echo ""
  echo -e "${CYAN}▸ $1${NC}"
}

explain() {
  echo -e "${DIM}  $1${NC}"
}

show_hub_log() {
  echo -e "${BLUE}"
  tail -n "${1:-5}" "$HUB_LOG" 2>/dev/null | sed 's/^/  /'
  echo -e "${NC}"
}

show_daemon_log() {
  echo -e "${GREEN}"
  tail -n "${1:-5}" "$DAEMON_LOG" 2>/dev/null | sed 's/^/  /'
  echo -e "${NC}"
}

show_json() {
  echo -e "${YELLOW}"
  echo "$1" | python3 -m json.tool 2>/dev/null | sed 's/^/  /'
  echo -e "${NC}"
}

pause() {
  echo ""
  echo -e "${DIM}  Press Enter to continue...${NC}"
  read -r
}

# =========================================================================

header "AGENTFLEET PROTOTYPE — GUIDED DEMO"
echo ""
echo "  This demo walks through the agent discovery and dispatch flow:"
echo ""
echo "    1. Start a Hub (central registry + dispatcher)"
echo "    2. Start a Daemon (registers local agents with the hub)"
echo "    3. Query the registry (see discovered agents)"
echo "    4. Dispatch tickets (hub routes to matching agents by tags)"
echo "    5. Watch agents work (status updates stream back to hub)"
echo "    6. View audit log (timestamps on every event)"
echo ""
echo "  Hub logs are in ${BLUE}blue${NC}. Daemon logs are in ${GREEN}green${NC}."
echo "  API responses are in ${YELLOW}yellow${NC}."

pause

# =========================================================================

header "STEP 1: Start the Hub"

step "Installing dependencies..."
(cd "$DIR/hub" && npm install --silent 2>&1) > /dev/null
(cd "$DIR/daemon" && npm install --silent 2>&1) > /dev/null

step "Starting hub on port 9900..."
explain "The hub is a WebSocket + HTTP server. It will accept daemon connections"
explain "and expose a REST API for querying agents and dispatching tickets."

node "$DIR/hub/index.js" > "$HUB_LOG" 2>&1 &
HUB_PID=$!
sleep 1

echo ""
echo -e "  Hub started (PID: $HUB_PID). Logs:"
show_hub_log 2

pause

# =========================================================================

header "STEP 2: Start the Daemon (Agent Discovery)"

step "The daemon reads agents.yaml — here's what it defines:"
echo ""
echo -e "${DIM}  ┌─────────────────────────────────────────────────────────────┐"
echo -e "  │  agents.yaml — local agent manifest                         │"
echo -e "  ├──────────────────┬────────────┬───────────┬─────────────────┤"
echo -e "  │  Agent           │ Tags       │ Capacity  │ Type            │"
echo -e "  ├──────────────────┼────────────┼───────────┼─────────────────┤"
echo -e "  │  backend-agent   │ backend,api│ 2 slots   │ simulated (echo)│"
echo -e "  │  frontend-agent  │ frontend,ui│ 1 slot    │ simulated (echo)│"
echo -e "  │  quick-fixer     │ bug,simple │ 4 slots   │ simulated (echo)│"
echo -e "  └──────────────────┴────────────┴───────────┴─────────────────┘${NC}"
echo ""

step "Starting daemon — it will connect to hub and register these agents..."

node "$DIR/daemon/index.js" > "$DAEMON_LOG" 2>&1 &
DAEMON_PID=$!
sleep 2

echo ""
echo -e "  ${GREEN}Daemon logs:${NC}"
show_daemon_log 5
echo -e "  ${BLUE}Hub logs (received registration):${NC}"
show_hub_log 5

pause

# =========================================================================

header "STEP 3: Query the Agent Registry"

step "GET /agents — asking the hub: what agents have been discovered?"
explain "The daemon registered 3 agents. The hub now knows about all of them."

AGENTS=$(curl -s http://localhost:9900/agents)
show_json "$AGENTS"

step "GET /status — fleet overview"
STATUS=$(curl -s http://localhost:9900/status)
show_json "$STATUS"

explain "1 machine online, 3 agents registered, 0 running jobs. Ready for work."

pause

# =========================================================================

header "STEP 4: Dispatch a Backend Ticket"

step "POST /dispatch — sending a ticket with labels [backend, api]"
explain "The hub will find an agent whose tags overlap with these labels."
explain "Expected match: backend-agent (tags: backend, api) → 2 overlapping tags."
echo ""

RESULT=$(curl -s -X POST http://localhost:9900/dispatch \
  -H 'Content-Type: application/json' \
  -d '{
    "ticket": {
      "id": "KIP-101",
      "title": "Add export API endpoint",
      "description": "Create a new REST endpoint for bulk data export",
      "labels": ["backend", "api"],
      "priority": "high"
    }
  }')
echo -e "  ${BOLD}Dispatch result:${NC}"
show_json "$RESULT"

sleep 1
echo -e "  ${BLUE}Hub — routed the ticket:${NC}"
show_hub_log 3

echo -e "  ${GREEN}Daemon — spawned the agent:${NC}"
show_daemon_log 5

step "Waiting 4 seconds for the agent to work..."
explain "The simulated agent echoes progress messages. Each line streams"
explain "back to the hub as a status update with a timestamp."
sleep 4

echo ""
echo -e "  ${GREEN}Daemon — agent progress:${NC}"
show_daemon_log 10

echo -e "  ${BLUE}Hub — received status updates:${NC}"
show_hub_log 10

pause

# =========================================================================

header "STEP 5: Dispatch a Bug Ticket (Different Agent)"

step "POST /dispatch — sending a ticket with labels [bug, simple]"
explain "This should match quick-fixer (tags: bug, simple), NOT backend-agent."
echo ""

RESULT=$(curl -s -X POST http://localhost:9900/dispatch \
  -H 'Content-Type: application/json' \
  -d '{
    "ticket": {
      "id": "KIP-202",
      "title": "Fix login button alignment",
      "description": "The login button is misaligned on mobile viewports",
      "labels": ["bug", "simple"],
      "priority": "low"
    }
  }')
echo -e "  ${BOLD}Dispatch result:${NC}"
show_json "$RESULT"

step "Waiting 3 seconds for quick-fixer to finish..."
sleep 3

echo ""
echo -e "  ${GREEN}Daemon — quick-fixer ran:${NC}"
show_daemon_log 8

echo -e "  ${BLUE}Hub — status + completion:${NC}"
show_hub_log 8

pause

# =========================================================================

header "STEP 6: Review — Audit Log & Final State"

step "GET /dispatches — full audit log with timestamps"
explain "Every dispatch, status ping, and completion is recorded with timestamps."
explain "This is where time tracking comes from."
echo ""

DISPATCHES=$(curl -s http://localhost:9900/dispatches)
show_json "$DISPATCHES"

pause

step "GET /status — final fleet status"
STATUS=$(curl -s http://localhost:9900/status)
show_json "$STATUS"
explain "Both jobs completed. Agents are idle again, ready for more work."

# =========================================================================

header "DEMO COMPLETE"
echo ""
echo "  What you just saw:"
echo ""
echo "    1. Hub started — empty registry, waiting for connections"
echo "    2. Daemon connected — registered 3 agents by reading agents.yaml"
echo "    3. Hub discovered agents — registry populated automatically"
echo "    4. Backend ticket dispatched — hub matched [backend,api] labels"
echo "       to backend-agent tags, routed to daemon, agent worked"
echo "    5. Bug ticket dispatched — hub matched [bug,simple] labels"
echo "       to quick-fixer tags, different agent handled it"
echo "    6. All status pings recorded with timestamps in the audit log"
echo ""
echo "  This is the agent discovery model:"
echo "    Agents are defined locally → registered with hub → discovered → dispatched to"
echo ""
echo -e "  ${DIM}Try it yourself! In another terminal while this is running:${NC}"
echo -e "  ${DIM}  curl http://localhost:9900/agents | python3 -m json.tool${NC}"
echo -e "  ${DIM}  curl -X POST http://localhost:9900/dispatch \\${NC}"
echo -e "  ${DIM}    -H 'Content-Type: application/json' \\${NC}"
echo -e "  ${DIM}    -d '{\"ticket\":{\"id\":\"TEST-1\",\"title\":\"test\",\"labels\":[\"frontend\"]}}' \\${NC}"
echo -e "  ${DIM}    | python3 -m json.tool${NC}"
echo ""
echo -e "  ${DIM}Press Enter to shut down, or Ctrl+C.${NC}"
read -r
