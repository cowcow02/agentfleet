import type { WebSocket } from "ws";
import { eventBus } from "./events";

export interface AgentInfo {
  name: string;
  tags: string[];
  capacity: number;
  running: number;
}

export interface Machine {
  orgId: string;
  name: string;
  ws: WebSocket;
  agents: Map<string, AgentInfo>;
  lastHeartbeat: Date;
}

/** Key: "${orgId}:${machineName}" */
const machines = new Map<string, Machine>();

function machineKey(orgId: string, name: string): string {
  return `${orgId}:${name}`;
}

export function registerMachine(
  orgId: string,
  name: string,
  ws: WebSocket,
  agents: { name: string; tags: string[]; capacity: number }[],
): Machine {
  const key = machineKey(orgId, name);
  const agentMap = new Map<string, AgentInfo>();
  for (const a of agents) {
    agentMap.set(a.name, { name: a.name, tags: a.tags, capacity: a.capacity, running: 0 });
  }
  const machine: Machine = { orgId, name, ws, agents: agentMap, lastHeartbeat: new Date() };
  machines.set(key, machine);
  emitAgentUpdate(orgId);
  return machine;
}

export function removeMachine(orgId: string, name: string): void {
  const key = machineKey(orgId, name);
  machines.delete(key);
  emitAgentUpdate(orgId);
}

export function updateHeartbeat(orgId: string, name: string): void {
  const key = machineKey(orgId, name);
  const machine = machines.get(key);
  if (machine) {
    machine.lastHeartbeat = new Date();
  }
}

export function getMachineByWs(ws: WebSocket): Machine | undefined {
  for (const machine of machines.values()) {
    if (machine.ws === ws) return machine;
  }
  return undefined;
}

export function getAgentsForOrg(orgId: string): {
  name: string;
  machine: string;
  tags: string[];
  capacity: number;
  running: number;
  lastHeartbeat: string;
}[] {
  const agents: ReturnType<typeof getAgentsForOrg> = [];
  for (const machine of machines.values()) {
    if (machine.orgId !== orgId) continue;
    for (const agent of machine.agents.values()) {
      agents.push({
        name: agent.name,
        machine: machine.name,
        tags: agent.tags,
        capacity: agent.capacity,
        running: agent.running,
        lastHeartbeat: machine.lastHeartbeat.toISOString(),
      });
    }
  }
  return agents;
}

export function getMachineCountForOrg(orgId: string): number {
  let count = 0;
  for (const machine of machines.values()) {
    if (machine.orgId === orgId) count++;
  }
  return count;
}

export function getRunningJobsForOrg(orgId: string): number {
  let total = 0;
  for (const machine of machines.values()) {
    if (machine.orgId !== orgId) continue;
    for (const agent of machine.agents.values()) {
      total += agent.running;
    }
  }
  return total;
}

/**
 * Find best agent for a dispatch by tag/label overlap scoring.
 * Requires at least 1 matching tag.
 * Picks highest-scoring agent with available capacity.
 * Ties broken by iteration order (registration order).
 */
export function findAgentForDispatch(
  orgId: string,
  labels: string[],
): { agent: AgentInfo; machine: Machine } | null {
  let bestAgent: AgentInfo | null = null;
  let bestMachine: Machine | null = null;
  let bestScore = 0;

  for (const machine of machines.values()) {
    if (machine.orgId !== orgId) continue;
    for (const agent of machine.agents.values()) {
      if (agent.running >= agent.capacity) continue;
      const score = agent.tags.filter((t) => labels.includes(t)).length;
      if (score > 0 && score > bestScore) {
        bestScore = score;
        bestAgent = agent;
        bestMachine = machine;
      }
    }
  }

  if (bestAgent && bestMachine) {
    return { agent: bestAgent, machine: bestMachine };
  }
  return null;
}

/**
 * Direct lookup for ad hoc dispatch — find a specific agent by (orgId, machineName, agentName).
 * Returns null if the machine or agent isn't registered, or the agent has no capacity.
 */
export function findAgentByName(
  orgId: string,
  machineName: string,
  agentName: string,
): { agent: AgentInfo; machine: Machine } | null {
  const machine = machines.get(machineKey(orgId, machineName));
  if (!machine) return null;
  const agent = machine.agents.get(agentName);
  if (!agent) return null;
  if (agent.running >= agent.capacity) return null;
  return { agent, machine };
}

function emitAgentUpdate(orgId: string): void {
  eventBus.emitAgentUpdate({
    orgId,
    agents: getAgentsForOrg(orgId),
    machines: getMachineCountForOrg(orgId),
  });
  eventBus.emitFeedEvent({
    orgId,
    message: `Fleet updated: ${getMachineCountForOrg(orgId)} machines, ${getAgentsForOrg(orgId).length} agents`,
    timestamp: new Date().toISOString(),
    type: "fleet",
  });
}

/** Stale connection cleanup: dead WS or 60s no heartbeat */
function cleanupStale(): void {
  const now = Date.now();
  const orgsAffected = new Set<string>();

  for (const [key, machine] of machines.entries()) {
    const wsOpen = machine.ws.readyState === machine.ws.OPEN;
    const heartbeatStale = now - machine.lastHeartbeat.getTime() > 60_000;

    if (!wsOpen || heartbeatStale) {
      machines.delete(key);
      orgsAffected.add(machine.orgId);
      if (wsOpen) {
        try {
          machine.ws.close();
        } catch {
          /* ignore */
        }
      }
    }
  }

  for (const orgId of orgsAffected) {
    emitAgentUpdate(orgId);
  }
}

setInterval(cleanupStale, 15_000);
