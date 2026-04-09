/**
 * Parse a JSONL transcript entry into structured telemetry events.
 * Each entry may produce 0 or more events.
 *
 * @param {object} entry - A parsed JSONL line from Claude Code transcript
 * @returns {Array<{event_type: string, data: object}>}
 */
function parseTelemetryEvents(entry) {
  if (!entry || !entry.type) return [];

  switch (entry.type) {
    case "assistant":
      return parseAssistantEntry(entry);
    case "user":
      return parseUserEntry(entry);
    case "attachment":
      return parseAttachmentEntry(entry);
    default:
      return [];
  }
}

function parseAssistantEntry(entry) {
  const content = entry.message?.content;
  if (!Array.isArray(content)) return [];

  const events = [];
  const requestId = entry.requestId;

  for (const block of content) {
    if (block.type === "tool_use") {
      events.push({
        event_type: "tool_call",
        data: {
          tool_name: block.name,
          input: block.input,
          request_id: requestId,
        },
      });
    } else if (block.type === "text" && block.text) {
      const preview = block.text.length > 200 ? block.text.slice(0, 200) : block.text;
      events.push({
        event_type: "assistant",
        data: {
          text_preview: preview,
          request_id: requestId,
        },
      });
    }
  }

  // Extract usage if present
  const usage = entry.message?.usage;
  if (usage) {
    events.push({
      event_type: "usage",
      data: {
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
        request_id: requestId,
      },
    });
  }

  return events;
}

function parseUserEntry(entry) {
  const content = entry.message?.content;
  if (!Array.isArray(content)) return [];

  const events = [];
  for (const block of content) {
    if (block.type === "tool_result") {
      events.push({
        event_type: "tool_result",
        data: {
          tool_use_id: block.tool_use_id,
          has_error: Boolean(block.is_error),
        },
      });
    }
  }
  return events;
}

function parseAttachmentEntry(entry) {
  return [
    {
      event_type: "attachment",
      data: {
        tools: entry.tools,
        session_id: entry.session_id,
      },
    },
  ];
}

module.exports = { parseTelemetryEvents };
