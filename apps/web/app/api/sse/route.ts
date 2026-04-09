const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:9900";

/**
 * SSE streaming proxy — Next.js rewrites buffer responses and break SSE.
 * This route handler fetches the upstream SSE stream and pipes it through
 * using a ReadableStream so events are delivered in real-time.
 */
export async function GET(req: Request) {
  const cookie = req.headers.get("cookie") || "";

  const upstream = await fetch(`${API_URL}/api/sse`, {
    headers: { cookie, accept: "text/event-stream" },
  });

  if (!upstream.ok || !upstream.body) {
    return new Response(upstream.statusText, { status: upstream.status });
  }

  return new Response(upstream.body, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
