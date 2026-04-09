import { Hono } from "hono";
import { db, dispatches, telemetryEvents, telemetryMetrics, telemetrySpans } from "@agentfleet/db";
import { eq } from "drizzle-orm";
import { resolveApiKey } from "../lib/api-key-auth";
import { OtlpLogsRequest, OtlpMetricsRequest, OtlpTracesRequest } from "@agentfleet/types";

const DEFAULT_USAGE = {
  input_tokens: 0,
  output_tokens: 0,
  cache_read_input_tokens: 0,
  cache_creation_input_tokens: 0,
  cost_usd: 0,
  model_requests: 0,
  tool_calls: 0,
};

/** Convert OTLP nanos (string or number) to a Date */
function nanosToDate(nanos: string | number | undefined): Date {
  if (!nanos) return new Date();
  const n = typeof nanos === "string" ? BigInt(nanos) : BigInt(nanos);
  return new Date(Number(n / BigInt(1_000_000)));
}

/** Extract a string attribute value from OTLP key-value pairs */
function getAttr(
  attrs: Array<{ key: string; value?: any }> | undefined,
  key: string,
): string | undefined {
  const kv = attrs?.find((a) => a.key === key);
  if (!kv?.value) return undefined;
  if (kv.value.stringValue !== undefined) return String(kv.value.stringValue);
  if (kv.value.intValue !== undefined) return String(kv.value.intValue);
  if (kv.value.doubleValue !== undefined) return String(kv.value.doubleValue);
  if (kv.value.boolValue !== undefined) return String(kv.value.boolValue);
  return undefined;
}

/** Convert OTLP attributes array to a plain object */
function attrsToObject(
  attrs: Array<{ key: string; value?: any }> | undefined,
): Record<string, any> | null {
  if (!attrs?.length) return null;
  const obj: Record<string, any> = {};
  for (const kv of attrs) {
    const v = kv.value;
    if (!v) continue;
    if (v.stringValue !== undefined) obj[kv.key] = v.stringValue;
    else if (v.intValue !== undefined)
      obj[kv.key] = typeof v.intValue === "string" ? parseInt(v.intValue, 10) : v.intValue;
    else if (v.doubleValue !== undefined) obj[kv.key] = v.doubleValue;
    else if (v.boolValue !== undefined) obj[kv.key] = v.boolValue;
    else obj[kv.key] = v;
  }
  return obj;
}

/** Authenticate via API key and extract dispatch context */
async function authAndContext(c: any): Promise<{ orgId: string; dispatchId: string } | Response> {
  const authHeader = c.req.header("authorization");
  if (!authHeader?.startsWith("Bearer afk_")) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const token = authHeader.slice(7);
  const result = await resolveApiKey(token);
  if (!result) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const dispatchId = c.req.header("x-dispatch-id");
  if (!dispatchId) {
    return c.json({ error: "Missing X-Dispatch-Id header" }, 400);
  }

  return { orgId: result.organizationId, dispatchId };
}

export const telemetryRouter = new Hono();

// --- POST /v1/logs ---
telemetryRouter.post("/v1/logs", async (c) => {
  const ctx = await authAndContext(c);
  if (ctx instanceof Response) return ctx;
  const { orgId, dispatchId } = ctx;

  const body = await c.req.json();
  const parsed = OtlpLogsRequest.parse(body);

  let usageDelta = { ...DEFAULT_USAGE };
  let hasUsageDelta = false;

  for (const rl of parsed.resourceLogs) {
    for (const sl of rl.scopeLogs) {
      for (const lr of sl.logRecords) {
        const eventType =
          getAttr(lr.attributes, "event.type") || (lr.body?.stringValue as string) || "unknown";

        await db.insert(telemetryEvents).values({
          dispatchId,
          organizationId: orgId,
          eventType,
          severity: lr.severityText ?? null,
          body: lr.body ?? {},
          attributes: attrsToObject(lr.attributes),
          timestamp: nanosToDate(lr.timeUnixNano),
        });

        // Accumulate usage from api_request events
        if (eventType === "api_request") {
          hasUsageDelta = true;
          const inputTokens = parseInt(getAttr(lr.attributes, "api.input_tokens") ?? "0", 10);
          const outputTokens = parseInt(getAttr(lr.attributes, "api.output_tokens") ?? "0", 10);
          const cacheRead = parseInt(
            getAttr(lr.attributes, "api.cache_read_input_tokens") ?? "0",
            10,
          );
          const cacheCreate = parseInt(
            getAttr(lr.attributes, "api.cache_creation_input_tokens") ?? "0",
            10,
          );
          const costUsd = parseFloat(getAttr(lr.attributes, "api.cost_usd") ?? "0");

          usageDelta.input_tokens += inputTokens;
          usageDelta.output_tokens += outputTokens;
          usageDelta.cache_read_input_tokens += cacheRead;
          usageDelta.cache_creation_input_tokens += cacheCreate;
          usageDelta.cost_usd += costUsd;
          usageDelta.model_requests += 1;
        }

        // Count tool calls from tool_result events
        if (eventType === "tool_result") {
          hasUsageDelta = true;
          usageDelta.tool_calls += 1;
        }
      }
    }
  }

  // Update dispatch usage if we have deltas
  if (hasUsageDelta) {
    const [dispatch] = await db
      .select()
      .from(dispatches)
      .where(eq(dispatches.id, dispatchId))
      .limit(1);

    if (dispatch) {
      const existing = (dispatch.usage as typeof DEFAULT_USAGE) ?? {
        ...DEFAULT_USAGE,
      };
      const updated = {
        input_tokens: existing.input_tokens + usageDelta.input_tokens,
        output_tokens: existing.output_tokens + usageDelta.output_tokens,
        cache_read_input_tokens:
          existing.cache_read_input_tokens + usageDelta.cache_read_input_tokens,
        cache_creation_input_tokens:
          existing.cache_creation_input_tokens + usageDelta.cache_creation_input_tokens,
        cost_usd: existing.cost_usd + usageDelta.cost_usd,
        model_requests: existing.model_requests + usageDelta.model_requests,
        tool_calls: existing.tool_calls + usageDelta.tool_calls,
      };

      await db
        .update(dispatches)
        .set({ usage: updated, updatedAt: new Date() })
        .where(eq(dispatches.id, dispatchId));
    }
  }

  return c.json({ partialSuccess: {} });
});

// --- POST /v1/metrics ---
telemetryRouter.post("/v1/metrics", async (c) => {
  const ctx = await authAndContext(c);
  if (ctx instanceof Response) return ctx;
  const { orgId, dispatchId } = ctx;

  const body = await c.req.json();
  const parsed = OtlpMetricsRequest.parse(body);

  for (const rm of parsed.resourceMetrics) {
    for (const sm of rm.scopeMetrics) {
      for (const metric of sm.metrics) {
        const dataPoints = metric.sum?.dataPoints ?? metric.gauge?.dataPoints ?? [];

        for (const dp of dataPoints) {
          const value =
            dp.asDouble ??
            (dp.asInt !== undefined
              ? typeof dp.asInt === "string"
                ? parseInt(dp.asInt, 10)
                : dp.asInt
              : 0);

          await db.insert(telemetryMetrics).values({
            dispatchId,
            organizationId: orgId,
            name: metric.name,
            value,
            unit: metric.unit ?? null,
            attributes: attrsToObject(dp.attributes),
            timestamp: nanosToDate(dp.timeUnixNano),
          });
        }
      }
    }
  }

  return c.json({ partialSuccess: {} });
});

// --- POST /v1/traces ---
telemetryRouter.post("/v1/traces", async (c) => {
  const ctx = await authAndContext(c);
  if (ctx instanceof Response) return ctx;
  const { orgId, dispatchId } = ctx;

  const body = await c.req.json();
  const parsed = OtlpTracesRequest.parse(body);

  for (const rs of parsed.resourceSpans) {
    for (const ss of rs.scopeSpans) {
      for (const span of ss.spans) {
        await db.insert(telemetrySpans).values({
          dispatchId,
          organizationId: orgId,
          traceId: span.traceId,
          spanId: span.spanId,
          parentSpanId: span.parentSpanId ?? null,
          name: span.name,
          kind: span.kind ?? null,
          status: span.status ?? null,
          attributes: attrsToObject(span.attributes),
          startTime: nanosToDate(span.startTimeUnixNano),
          endTime: nanosToDate(span.endTimeUnixNano),
        });
      }
    }
  }

  return c.json({ partialSuccess: {} });
});
