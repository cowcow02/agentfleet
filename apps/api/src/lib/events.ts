import { EventEmitter } from "node:events";

export interface AgentUpdatePayload {
  orgId: string;
  agents: {
    name: string;
    machine: string;
    tags: string[];
    capacity: number;
    running: number;
    lastHeartbeat: string;
  }[];
  machines: number;
}

export interface DispatchUpdatePayload {
  orgId: string;
  dispatch: Record<string, unknown>;
}

export interface FeedEventPayload {
  orgId: string;
  message: string;
  timestamp: string;
  type: string;
}

class EventBus extends EventEmitter {
  emitAgentUpdate(payload: AgentUpdatePayload) {
    this.emit("agent:update", payload);
  }

  emitDispatchUpdate(payload: DispatchUpdatePayload) {
    this.emit("dispatch:update", payload);
  }

  emitFeedEvent(payload: FeedEventPayload) {
    this.emit("feed:event", payload);
  }
}

export const eventBus = new EventBus();
