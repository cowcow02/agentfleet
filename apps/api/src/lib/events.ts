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

export interface TranscriptEventPayload {
  orgId: string;
  dispatchId: string;
  sessionId: string;
  eventType: string;
  data: Record<string, unknown>;
  timestamp: string;
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

  emitTranscriptEvent(payload: TranscriptEventPayload) {
    this.emit("transcript:event", payload);
  }
}

export const eventBus = new EventBus();
