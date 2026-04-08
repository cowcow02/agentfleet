"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import type { SseEvent } from "@agentfleet/types";

// Uses relative URL — Next.js rewrites proxy /api/* to the API server
const RECONNECT_DELAY = 3000;
const MAX_RECONNECT_DELAY = 30000;

type SseEventHandler = (event: SseEvent) => void;

export function useSSE(onEvent: SseEventHandler) {
  const [connected, setConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelayRef = useRef(RECONNECT_DELAY);
  const onEventRef = useRef(onEvent);

  // Keep callback ref fresh without re-triggering effect
  onEventRef.current = onEvent;

  const connect = useCallback(() => {
    // Clean up any existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const es = new EventSource(`/api/sse`);

    es.onopen = () => {
      setConnected(true);
      reconnectDelayRef.current = RECONNECT_DELAY;
    };

    // Listen for specific event types
    const eventTypes = ["agent:update", "dispatch:update", "feed:event"] as const;

    for (const eventType of eventTypes) {
      es.addEventListener(eventType, (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          onEventRef.current({ event: eventType, data } as SseEvent);
        } catch {
          // Ignore malformed events
        }
      });
    }

    es.onerror = () => {
      setConnected(false);
      es.close();

      // Schedule reconnect with exponential backoff
      const delay = reconnectDelayRef.current;
      reconnectDelayRef.current = Math.min(delay * 2, MAX_RECONNECT_DELAY);

      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, delay);
    };

    eventSourceRef.current = es;
  }, []);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [connect]);

  return { connected };
}
