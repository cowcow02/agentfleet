import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, WebSocket } from "ws";
import { DaemonMessage } from "@agentfleet/types";
import { auth } from "../auth";
import {
  registerMachine,
  removeMachine,
  updateHeartbeat,
  getMachineByWs,
} from "../lib/machines";
import { appendDispatchMessage, completeDispatch } from "../lib/dispatch";
import { eventBus } from "../lib/events";
import { getAgentsForOrg, getMachineCountForOrg } from "../lib/machines";

/**
 * Create a WS upgrade handler using the given WebSocketServer (noServer mode).
 * Authenticates via Bearer token (session token) in Authorization header during upgrade.
 * The bearer plugin converts the token to a session lookup.
 */
export function createWsHandler(wss: WebSocketServer) {
  return async function handleUpgrade(
    req: IncomingMessage,
    socket: Duplex,
    head: Buffer
  ) {
    // Authenticate via Bearer token (session token or API key)
    const authHeader = req.headers["authorization"];
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    let orgId: string | undefined;

    try {
      // Build headers object for Better Auth session lookup
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (value) headers.set(key, Array.isArray(value) ? value[0] : value);
      }

      const session = await auth.api.getSession({ headers });
      if (!session) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }

      orgId = (session.session as any).activeOrganizationId;
      if (!orgId) {
        socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
        socket.destroy();
        return;
      }
    } catch {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    // Complete WS upgrade
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
      handleConnection(ws, orgId!);
    });
  };
}

function handleConnection(ws: WebSocket, orgId: string) {
  let machineName: string | null = null;

  ws.on("message", async (raw) => {
    let data: unknown;
    try {
      data = JSON.parse(raw.toString());
    } catch {
      sendError(ws, "Invalid JSON");
      return;
    }

    const parsed = DaemonMessage.safeParse(data);
    if (!parsed.success) {
      sendError(ws, `Invalid message: ${parsed.error.issues.map((i) => i.message).join(", ")}`);
      return;
    }

    const msg = parsed.data;

    switch (msg.type) {
      case "register": {
        machineName = msg.machine;
        registerMachine(orgId, msg.machine, ws, msg.agents);
        ws.send(
          JSON.stringify({
            type: "registered",
            machine: msg.machine,
            agents: msg.agents.length,
          })
        );
        console.log(
          `[WS] Registered ${msg.machine} with ${msg.agents.length} agents (org: ${orgId})`
        );
        break;
      }

      case "heartbeat": {
        if (machineName) {
          updateHeartbeat(orgId, machineName);
        }
        break;
      }

      case "status": {
        await appendDispatchMessage(msg.dispatch_id, msg.message, msg.timestamp);
        ws.send(JSON.stringify({ type: "ack", dispatch_id: msg.dispatch_id }));
        break;
      }

      case "complete": {
        // Decrement agent running count
        const machine = getMachineByWs(ws);
        if (machine) {
          for (const agent of machine.agents.values()) {
            if (agent.running > 0) {
              agent.running--;
              break;
            }
          }
          // Emit agent update after capacity change
          eventBus.emitAgentUpdate({
            orgId,
            agents: getAgentsForOrg(orgId),
            machines: getMachineCountForOrg(orgId),
          });
        }

        // duration_seconds -> duration_ms conversion happens in completeDispatch
        await completeDispatch(
          msg.dispatch_id,
          msg.success,
          msg.exit_code,
          msg.duration_seconds
        );
        ws.send(JSON.stringify({ type: "ack", dispatch_id: msg.dispatch_id }));
        break;
      }
    }
  });

  ws.on("close", () => {
    if (machineName) {
      removeMachine(orgId, machineName);
      console.log(`[WS] Disconnected: ${machineName} (org: ${orgId})`);
    }
  });

  ws.on("error", (err) => {
    console.error(`[WS] Error:`, err.message);
  });
}

function sendError(ws: WebSocket, message: string) {
  ws.send(JSON.stringify({ type: "error", message }));
}
