const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { parseTelemetryEvents } = require("../telemetry-parser");

describe("parseTelemetryEvents", () => {
  it("parses assistant entry with tool_use blocks into tool_call events", () => {
    const entry = {
      type: "assistant",
      message: {
        content: [
          { type: "tool_use", name: "Read", input: { file_path: "/foo/bar.ts" } },
          { type: "tool_use", name: "Bash", input: { command: "ls -la" } },
        ],
        usage: { input_tokens: 100, output_tokens: 50 },
      },
      requestId: "req-1",
    };

    const events = parseTelemetryEvents(entry);

    assert.equal(events.length, 3);
    assert.deepEqual(events[0], {
      event_type: "tool_call",
      data: { tool_name: "Read", input: { file_path: "/foo/bar.ts" }, request_id: "req-1" },
    });
    assert.deepEqual(events[1], {
      event_type: "tool_call",
      data: { tool_name: "Bash", input: { command: "ls -la" }, request_id: "req-1" },
    });
    assert.deepEqual(events[2], {
      event_type: "usage",
      data: { input_tokens: 100, output_tokens: 50, request_id: "req-1" },
    });
  });

  it("parses assistant entry with text blocks", () => {
    const entry = {
      type: "assistant",
      message: { content: [{ type: "text", text: "I'll read the file now." }] },
      requestId: "req-2",
    };

    const events = parseTelemetryEvents(entry);
    assert.equal(events.length, 1);
    assert.deepEqual(events[0], {
      event_type: "assistant",
      data: { text_preview: "I'll read the file now.", request_id: "req-2" },
    });
  });

  it("truncates long text previews to 200 chars", () => {
    const longText = "x".repeat(300);
    const entry = {
      type: "assistant",
      message: { content: [{ type: "text", text: longText }] },
    };

    const events = parseTelemetryEvents(entry);
    assert.equal(events[0].data.text_preview.length, 200);
  });

  it("parses user entry as tool_result event", () => {
    const entry = {
      type: "user",
      message: {
        content: [{ type: "tool_result", tool_use_id: "tu-1", content: "file contents" }],
      },
    };

    const events = parseTelemetryEvents(entry);
    assert.equal(events.length, 1);
    assert.deepEqual(events[0], {
      event_type: "tool_result",
      data: { tool_use_id: "tu-1", has_error: false },
    });
  });

  it("detects error tool results", () => {
    const entry = {
      type: "user",
      message: {
        content: [{ type: "tool_result", tool_use_id: "tu-1", is_error: true, content: "Error" }],
      },
    };

    const events = parseTelemetryEvents(entry);
    assert.equal(events[0].data.has_error, true);
  });

  it("parses attachment entry", () => {
    const entry = { type: "attachment", tools: ["Read", "Write", "Bash"], session_id: "sess-1" };

    const events = parseTelemetryEvents(entry);
    assert.equal(events.length, 1);
    assert.deepEqual(events[0], {
      event_type: "attachment",
      data: { tools: ["Read", "Write", "Bash"], session_id: "sess-1" },
    });
  });

  it("returns empty array for unknown entry types", () => {
    assert.deepEqual(parseTelemetryEvents({ type: "system", subtype: "init" }), []);
  });

  it("returns empty array for null/undefined", () => {
    assert.deepEqual(parseTelemetryEvents(null), []);
    assert.deepEqual(parseTelemetryEvents(undefined), []);
  });

  it("handles assistant entry with no content array", () => {
    assert.deepEqual(parseTelemetryEvents({ type: "assistant", message: {} }), []);
  });

  it("handles mixed content blocks, ignoring thinking blocks", () => {
    const entry = {
      type: "assistant",
      message: {
        content: [
          { type: "text", text: "Let me edit that file." },
          { type: "tool_use", name: "Edit", input: { file_path: "/a.ts" } },
          { type: "thinking", text: "internal" },
        ],
      },
      requestId: "req-3",
    };

    const events = parseTelemetryEvents(entry);
    assert.equal(events.length, 2);
    assert.equal(events[0].event_type, "assistant");
    assert.equal(events[1].event_type, "tool_call");
  });
});
