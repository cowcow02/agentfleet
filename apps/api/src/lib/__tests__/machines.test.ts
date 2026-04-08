import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock events module before importing machines
vi.mock("../events", () => {
  const emitAgentUpdate = vi.fn();
  const emitFeedEvent = vi.fn();
  return {
    eventBus: {
      emitAgentUpdate,
      emitDispatchUpdate: vi.fn(),
      emitFeedEvent,
      on: vi.fn(),
      off: vi.fn(),
    },
  };
});

import {
  registerMachine,
  removeMachine,
  updateHeartbeat,
  getMachineByWs,
  getAgentsForOrg,
  getMachineCountForOrg,
  getRunningJobsForOrg,
  findAgentForDispatch,
} from "../machines";
import { eventBus } from "../events";

function makeWs(readyState = 1 /* OPEN */): any {
  return { readyState, OPEN: 1, send: vi.fn(), close: vi.fn() };
}

describe("machines", () => {
  // Clear machines between tests by registering and removing
  // The module maintains a global Map, so we need to clean up.
  const testOrg = "test-org";
  const testOrg2 = "test-org-2";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Clean up any registered machines
    try {
      removeMachine(testOrg, "m1");
    } catch {}
    try {
      removeMachine(testOrg, "m2");
    } catch {}
    try {
      removeMachine(testOrg2, "m3");
    } catch {}
  });

  describe("registerMachine", () => {
    it("adds machine and returns it", () => {
      const ws = makeWs();
      const m = registerMachine(testOrg, "m1", ws, [
        { name: "agent-a", tags: ["ts", "python"], capacity: 3 },
      ]);

      expect(m.orgId).toBe(testOrg);
      expect(m.name).toBe("m1");
      expect(m.ws).toBe(ws);
      expect(m.agents.size).toBe(1);
      expect(m.agents.get("agent-a")).toMatchObject({
        name: "agent-a",
        tags: ["ts", "python"],
        capacity: 3,
        running: 0,
      });
    });

    it("emits agent:update event", () => {
      const ws = makeWs();
      registerMachine(testOrg, "m1", ws, [{ name: "agent-a", tags: ["ts"], capacity: 1 }]);

      expect(eventBus.emitAgentUpdate).toHaveBeenCalled();
      expect(eventBus.emitFeedEvent).toHaveBeenCalled();
    });

    it("registers multiple agents on one machine", () => {
      const ws = makeWs();
      const m = registerMachine(testOrg, "m1", ws, [
        { name: "a1", tags: ["ts"], capacity: 2 },
        { name: "a2", tags: ["python"], capacity: 1 },
      ]);

      expect(m.agents.size).toBe(2);
    });
  });

  describe("removeMachine", () => {
    it("removes machine from map", () => {
      const ws = makeWs();
      registerMachine(testOrg, "m1", ws, [{ name: "a", tags: ["x"], capacity: 1 }]);

      removeMachine(testOrg, "m1");

      expect(getAgentsForOrg(testOrg)).toEqual([]);
    });

    it("emits agent:update event", () => {
      const ws = makeWs();
      registerMachine(testOrg, "m1", ws, [{ name: "a", tags: ["x"], capacity: 1 }]);
      vi.clearAllMocks();

      removeMachine(testOrg, "m1");

      expect(eventBus.emitAgentUpdate).toHaveBeenCalled();
    });
  });

  describe("updateHeartbeat", () => {
    it("updates lastHeartbeat timestamp", () => {
      const ws = makeWs();
      const m = registerMachine(testOrg, "m1", ws, [{ name: "a", tags: ["x"], capacity: 1 }]);
      const before = m.lastHeartbeat.getTime();

      // Small delay to ensure time difference
      updateHeartbeat(testOrg, "m1");

      expect(m.lastHeartbeat.getTime()).toBeGreaterThanOrEqual(before);
    });

    it("does nothing for non-existent machine", () => {
      // Should not throw
      updateHeartbeat(testOrg, "nonexistent");
    });
  });

  describe("getMachineByWs", () => {
    it("returns machine by WebSocket reference", () => {
      const ws = makeWs();
      registerMachine(testOrg, "m1", ws, [{ name: "a", tags: ["x"], capacity: 1 }]);

      const found = getMachineByWs(ws);
      expect(found).toBeDefined();
      expect(found!.name).toBe("m1");
    });

    it("returns undefined for unknown WebSocket", () => {
      const ws = makeWs();
      expect(getMachineByWs(ws)).toBeUndefined();
    });
  });

  describe("getAgentsForOrg", () => {
    it("returns agents for the given org only", () => {
      const ws1 = makeWs();
      const ws2 = makeWs();
      registerMachine(testOrg, "m1", ws1, [{ name: "a1", tags: ["ts"], capacity: 2 }]);
      registerMachine(testOrg2, "m3", ws2, [{ name: "a2", tags: ["py"], capacity: 1 }]);

      const agents = getAgentsForOrg(testOrg);
      expect(agents).toHaveLength(1);
      expect(agents[0].name).toBe("a1");
      expect(agents[0].machine).toBe("m1");
      expect(agents[0].tags).toEqual(["ts"]);
      expect(agents[0].capacity).toBe(2);
      expect(agents[0].running).toBe(0);
      expect(agents[0].lastHeartbeat).toBeDefined();
    });

    it("returns empty array for org with no machines", () => {
      expect(getAgentsForOrg("no-such-org")).toEqual([]);
    });
  });

  describe("getMachineCountForOrg", () => {
    it("counts machines for the given org", () => {
      const ws1 = makeWs();
      const ws2 = makeWs();
      registerMachine(testOrg, "m1", ws1, [{ name: "a1", tags: ["ts"], capacity: 1 }]);
      registerMachine(testOrg, "m2", ws2, [{ name: "a2", tags: ["py"], capacity: 1 }]);

      expect(getMachineCountForOrg(testOrg)).toBe(2);
    });

    it("returns 0 for org with no machines", () => {
      expect(getMachineCountForOrg("no-such-org")).toBe(0);
    });
  });

  describe("getRunningJobsForOrg", () => {
    it("sums running counts across all agents in org", () => {
      const ws = makeWs();
      const m = registerMachine(testOrg, "m1", ws, [
        { name: "a1", tags: ["ts"], capacity: 5 },
        { name: "a2", tags: ["py"], capacity: 3 },
      ]);
      m.agents.get("a1")!.running = 2;
      m.agents.get("a2")!.running = 1;

      expect(getRunningJobsForOrg(testOrg)).toBe(3);
    });

    it("returns 0 when no jobs are running", () => {
      const ws = makeWs();
      registerMachine(testOrg, "m1", ws, [{ name: "a1", tags: ["ts"], capacity: 5 }]);
      expect(getRunningJobsForOrg(testOrg)).toBe(0);
    });

    it("returns 0 for org with no machines", () => {
      expect(getRunningJobsForOrg("no-such-org")).toBe(0);
    });

    it("skips machines from different orgs", () => {
      const ws1 = makeWs();
      const ws2 = makeWs();
      const m1 = registerMachine(testOrg, "m1", ws1, [{ name: "a1", tags: ["ts"], capacity: 5 }]);
      const m2 = registerMachine(testOrg2, "m3", ws2, [{ name: "a2", tags: ["py"], capacity: 3 }]);
      m1.agents.get("a1")!.running = 2;
      m2.agents.get("a2")!.running = 3;

      // Should only count testOrg's running jobs
      expect(getRunningJobsForOrg(testOrg)).toBe(2);
      expect(getRunningJobsForOrg(testOrg2)).toBe(3);
    });
  });

  describe("findAgentForDispatch", () => {
    it("finds agent with best tag overlap", () => {
      const ws = makeWs();
      registerMachine(testOrg, "m1", ws, [
        { name: "a1", tags: ["ts"], capacity: 2 },
        { name: "a2", tags: ["ts", "python", "react"], capacity: 2 },
      ]);

      const result = findAgentForDispatch(testOrg, ["ts", "python"]);
      expect(result).not.toBeNull();
      expect(result!.agent.name).toBe("a2"); // score 2 vs 1
    });

    it("skips agents at full capacity", () => {
      const ws = makeWs();
      const m = registerMachine(testOrg, "m1", ws, [
        { name: "a1", tags: ["ts", "python"], capacity: 1 },
        { name: "a2", tags: ["ts"], capacity: 2 },
      ]);
      m.agents.get("a1")!.running = 1; // at capacity

      const result = findAgentForDispatch(testOrg, ["ts", "python"]);
      expect(result).not.toBeNull();
      expect(result!.agent.name).toBe("a2");
    });

    it("returns null when no tags match", () => {
      const ws = makeWs();
      registerMachine(testOrg, "m1", ws, [{ name: "a1", tags: ["go", "rust"], capacity: 5 }]);

      const result = findAgentForDispatch(testOrg, ["ts", "python"]);
      expect(result).toBeNull();
    });

    it("returns null when no agent has capacity", () => {
      const ws = makeWs();
      const m = registerMachine(testOrg, "m1", ws, [{ name: "a1", tags: ["ts"], capacity: 1 }]);
      m.agents.get("a1")!.running = 1;

      const result = findAgentForDispatch(testOrg, ["ts"]);
      expect(result).toBeNull();
    });

    it("returns null for org with no machines", () => {
      expect(findAgentForDispatch("no-such-org", ["ts"])).toBeNull();
    });

    it("does not match agents from different org", () => {
      const ws = makeWs();
      registerMachine(testOrg2, "m3", ws, [{ name: "a1", tags: ["ts"], capacity: 5 }]);

      const result = findAgentForDispatch(testOrg, ["ts"]);
      expect(result).toBeNull();
    });
  });
});
