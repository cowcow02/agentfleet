import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

// --- Mock DB ---
const insertedRows: { table: string; values: any }[] = [];
const updatedRows: { table: string; values: any; where: any }[] = [];
let selectResult: any = null;

vi.mock("@agentfleet/db", () => {
  const dispatches = {
    id: "id",
    organizationId: "organization_id",
    usage: "usage",
    updatedAt: "updated_at",
  };
  const telemetryEvents = { id: "id", dispatchId: "dispatch_id" };
  const telemetryMetrics = { id: "id", dispatchId: "dispatch_id" };
  const telemetrySpans = { id: "id", dispatchId: "dispatch_id" };

  function makeInsertChain(tableName: string): any {
    let capturedValues: any;
    const chain: any = {
      values: (v: any) => {
        capturedValues = v;
        insertedRows.push({ table: tableName, values: v });
        return chain;
      },
      returning: () => chain,
      then: (resolve: Function) => resolve([capturedValues]),
    };
    return chain;
  }

  function makeSelectChain(): any {
    const chain: any = {
      from: () => chain,
      where: () => chain,
      limit: () => chain,
      then: (resolve: Function) => resolve(selectResult ? [selectResult] : []),
    };
    return chain;
  }

  function makeUpdateChain(tableName: string): any {
    let capturedSet: any;
    let capturedWhere: any;
    const chain: any = {
      set: (v: any) => {
        capturedSet = v;
        return chain;
      },
      where: (w: any) => {
        capturedWhere = w;
        updatedRows.push({ table: tableName, values: capturedSet, where: capturedWhere });
        return chain;
      },
      then: (resolve: Function) => resolve([]),
    };
    return chain;
  }

  return {
    db: {
      insert: (table: any) => {
        if (table === telemetryEvents) return makeInsertChain("telemetryEvents");
        if (table === telemetryMetrics) return makeInsertChain("telemetryMetrics");
        if (table === telemetrySpans) return makeInsertChain("telemetrySpans");
        return makeInsertChain("unknown");
      },
      select: () => makeSelectChain(),
      update: (table: any) => {
        if (table === dispatches) return makeUpdateChain("dispatches");
        return makeUpdateChain("unknown");
      },
    },
    dispatches,
    telemetryEvents,
    telemetryMetrics,
    telemetrySpans,
    eq: vi.fn((a: any, b: any) => ({ _eq: [a, b] })),
  };
});

// Mock API key auth
vi.mock("../../lib/api-key-auth", () => ({
  resolveApiKey: vi.fn(async (token: string) => {
    if (token === "afk_valid_key") {
      return { organizationId: "org-test", userId: "user-1" };
    }
    return null;
  }),
}));

// Import after mocks
const { telemetryRouter } = await import("../telemetry");

function createApp() {
  const app = new Hono();
  app.route("", telemetryRouter);
  return app;
}

const VALID_DISPATCH_ID = "00000000-0000-0000-0000-000000000001";

beforeEach(() => {
  insertedRows.length = 0;
  updatedRows.length = 0;
  selectResult = {
    id: VALID_DISPATCH_ID,
    organizationId: "org-test",
    usage: null,
  };
});

describe("POST /v1/logs", () => {
  it("accepts valid OTLP logs payload and stores events", async () => {
    const app = createApp();
    const res = await app.request("/v1/logs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer afk_valid_key",
        "X-Dispatch-Id": VALID_DISPATCH_ID,
      },
      body: JSON.stringify({
        resourceLogs: [
          {
            resource: {
              attributes: [{ key: "service.name", value: { stringValue: "claude-code" } }],
            },
            scopeLogs: [
              {
                logRecords: [
                  {
                    timeUnixNano: "1700000000000000000",
                    severityText: "INFO",
                    body: { stringValue: "tool_result" },
                    attributes: [
                      { key: "event.type", value: { stringValue: "tool_result" } },
                      { key: "tool.name", value: { stringValue: "Read" } },
                      { key: "tool.success", value: { boolValue: true } },
                      { key: "tool.duration_ms", value: { intValue: "150" } },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      }),
    });

    expect(res.status).toBe(200);
    expect(insertedRows.some((r) => r.table === "telemetryEvents")).toBe(true);
    const event = insertedRows.find((r) => r.table === "telemetryEvents");
    expect(event?.values.eventType).toBe("tool_result");
    expect(event?.values.dispatchId).toBe(VALID_DISPATCH_ID);
  });

  it("updates dispatch usage on api_request events", async () => {
    const app = createApp();
    const res = await app.request("/v1/logs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer afk_valid_key",
        "X-Dispatch-Id": VALID_DISPATCH_ID,
      },
      body: JSON.stringify({
        resourceLogs: [
          {
            scopeLogs: [
              {
                logRecords: [
                  {
                    timeUnixNano: "1700000000000000000",
                    severityText: "INFO",
                    body: { stringValue: "api_request" },
                    attributes: [
                      { key: "event.type", value: { stringValue: "api_request" } },
                      { key: "api.model", value: { stringValue: "claude-sonnet-4-5-20250514" } },
                      { key: "api.input_tokens", value: { intValue: "5000" } },
                      { key: "api.output_tokens", value: { intValue: "3200" } },
                      { key: "api.cache_read_input_tokens", value: { intValue: "20000" } },
                      { key: "api.cache_creation_input_tokens", value: { intValue: "2000" } },
                      { key: "api.cost_usd", value: { doubleValue: 0.045 } },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      }),
    });

    expect(res.status).toBe(200);
    // Should update dispatch usage
    expect(updatedRows.some((r) => r.table === "dispatches")).toBe(true);
    const update = updatedRows.find((r) => r.table === "dispatches");
    expect(update?.values.usage.input_tokens).toBe(5000);
    expect(update?.values.usage.output_tokens).toBe(3200);
    expect(update?.values.usage.cost_usd).toBeCloseTo(0.045);
    expect(update?.values.usage.model_requests).toBe(1);
  });

  it("rejects requests without API key", async () => {
    const app = createApp();
    const res = await app.request("/v1/logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resourceLogs: [] }),
    });

    expect(res.status).toBe(401);
  });

  it("rejects requests without dispatch ID", async () => {
    const app = createApp();
    const res = await app.request("/v1/logs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer afk_valid_key",
      },
      body: JSON.stringify({ resourceLogs: [] }),
    });

    expect(res.status).toBe(400);
  });

  it("accumulates usage on existing dispatch usage", async () => {
    selectResult = {
      id: VALID_DISPATCH_ID,
      organizationId: "org-test",
      usage: {
        input_tokens: 1000,
        output_tokens: 500,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
        cost_usd: 0.01,
        model_requests: 2,
        tool_calls: 5,
      },
    };

    const app = createApp();
    const res = await app.request("/v1/logs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer afk_valid_key",
        "X-Dispatch-Id": VALID_DISPATCH_ID,
      },
      body: JSON.stringify({
        resourceLogs: [
          {
            scopeLogs: [
              {
                logRecords: [
                  {
                    timeUnixNano: "1700000000000000000",
                    body: { stringValue: "api_request" },
                    attributes: [
                      { key: "event.type", value: { stringValue: "api_request" } },
                      { key: "api.input_tokens", value: { intValue: "2000" } },
                      { key: "api.output_tokens", value: { intValue: "1000" } },
                      { key: "api.cost_usd", value: { doubleValue: 0.02 } },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      }),
    });

    expect(res.status).toBe(200);
    const update = updatedRows.find((r) => r.table === "dispatches");
    expect(update?.values.usage.input_tokens).toBe(3000);
    expect(update?.values.usage.output_tokens).toBe(1500);
    expect(update?.values.usage.cost_usd).toBeCloseTo(0.03);
    expect(update?.values.usage.model_requests).toBe(3);
  });

  it("increments tool_calls on tool_result events", async () => {
    const app = createApp();
    const res = await app.request("/v1/logs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer afk_valid_key",
        "X-Dispatch-Id": VALID_DISPATCH_ID,
      },
      body: JSON.stringify({
        resourceLogs: [
          {
            scopeLogs: [
              {
                logRecords: [
                  {
                    timeUnixNano: "1700000000000000000",
                    body: { stringValue: "tool_result" },
                    attributes: [
                      { key: "event.type", value: { stringValue: "tool_result" } },
                      { key: "tool.name", value: { stringValue: "Bash" } },
                    ],
                  },
                  {
                    timeUnixNano: "1700000000000000000",
                    body: { stringValue: "tool_result" },
                    attributes: [
                      { key: "event.type", value: { stringValue: "tool_result" } },
                      { key: "tool.name", value: { stringValue: "Read" } },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      }),
    });

    expect(res.status).toBe(200);
    const update = updatedRows.find((r) => r.table === "dispatches");
    expect(update?.values.usage.tool_calls).toBe(2);
  });
});

describe("POST /v1/metrics", () => {
  it("accepts valid OTLP metrics payload and stores metrics", async () => {
    const app = createApp();
    const res = await app.request("/v1/metrics", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer afk_valid_key",
        "X-Dispatch-Id": VALID_DISPATCH_ID,
      },
      body: JSON.stringify({
        resourceMetrics: [
          {
            scopeMetrics: [
              {
                metrics: [
                  {
                    name: "token.usage",
                    unit: "tokens",
                    sum: {
                      dataPoints: [
                        {
                          timeUnixNano: "1700000000000000000",
                          asInt: "5000",
                          attributes: [{ key: "token.type", value: { stringValue: "input" } }],
                        },
                      ],
                    },
                  },
                ],
              },
            ],
          },
        ],
      }),
    });

    expect(res.status).toBe(200);
    expect(insertedRows.some((r) => r.table === "telemetryMetrics")).toBe(true);
    const metric = insertedRows.find((r) => r.table === "telemetryMetrics");
    expect(metric?.values.name).toBe("token.usage");
    expect(metric?.values.value).toBe(5000);
  });

  it("rejects requests without API key", async () => {
    const app = createApp();
    const res = await app.request("/v1/metrics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resourceMetrics: [] }),
    });
    expect(res.status).toBe(401);
  });
});

describe("POST /v1/traces", () => {
  it("accepts valid OTLP traces payload and stores spans", async () => {
    const app = createApp();
    const res = await app.request("/v1/traces", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer afk_valid_key",
        "X-Dispatch-Id": VALID_DISPATCH_ID,
      },
      body: JSON.stringify({
        resourceSpans: [
          {
            scopeSpans: [
              {
                spans: [
                  {
                    traceId: "abc123",
                    spanId: "span001",
                    name: "tool.Read",
                    kind: 1,
                    startTimeUnixNano: "1700000000000000000",
                    endTimeUnixNano: "1700000000150000000",
                    attributes: [{ key: "tool.name", value: { stringValue: "Read" } }],
                    status: { code: 1 },
                  },
                ],
              },
            ],
          },
        ],
      }),
    });

    expect(res.status).toBe(200);
    expect(insertedRows.some((r) => r.table === "telemetrySpans")).toBe(true);
    const span = insertedRows.find((r) => r.table === "telemetrySpans");
    expect(span?.values.traceId).toBe("abc123");
    expect(span?.values.name).toBe("tool.Read");
  });

  it("rejects requests without API key", async () => {
    const app = createApp();
    const res = await app.request("/v1/traces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resourceSpans: [] }),
    });
    expect(res.status).toBe(401);
  });
});
