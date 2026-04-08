import type {
  CreateDispatchRequest,
  CreateDispatchResponse,
  ListDispatchesResponse,
  DashboardStatsResponse,
  ListAgentsResponse,
  LinearConfigResponse,
  UpdateLinearConfigRequest,
  ListLinearIssuesResponse,
  ListWebhookLogsResponse,
  Dispatch,
} from "@agentfleet/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:9900";

class ApiError extends Error {
  constructor(
    public status: number,
    public code: string | undefined,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${API_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, body.code, body.error ?? "Request failed");
  }

  // Handle 204 No Content
  if (res.status === 204) {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}

// --- Dashboard ---

export function fetchDashboardStats(): Promise<DashboardStatsResponse> {
  return request<DashboardStatsResponse>("/api/dashboard/stats");
}

// --- Dispatches ---

export function fetchDispatches(params?: {
  status?: string;
  source?: string;
  agent?: string;
  limit?: number;
  offset?: number;
}): Promise<ListDispatchesResponse> {
  const query = new URLSearchParams();
  if (params?.status) query.set("status", params.status);
  if (params?.source) query.set("source", params.source);
  if (params?.agent) query.set("agent", params.agent);
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.offset) query.set("offset", String(params.offset));
  const qs = query.toString();
  return request<ListDispatchesResponse>(`/api/dispatches${qs ? `?${qs}` : ""}`);
}

export function fetchDispatch(id: string): Promise<Dispatch> {
  return request<Dispatch>(`/api/dispatches/${id}`);
}

export function createDispatch(
  data: CreateDispatchRequest,
): Promise<CreateDispatchResponse> {
  return request<CreateDispatchResponse>("/api/dispatches", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// --- Agents ---

export function fetchAgents(): Promise<ListAgentsResponse> {
  return request<ListAgentsResponse>("/api/agents");
}

// --- Linear Integration ---

export function fetchLinearConfig(): Promise<LinearConfigResponse> {
  return request<LinearConfigResponse>("/api/integrations/linear");
}

export function updateLinearConfig(
  data: UpdateLinearConfigRequest,
): Promise<LinearConfigResponse> {
  return request<LinearConfigResponse>("/api/integrations/linear", {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function deleteLinearConfig(): Promise<void> {
  return request<void>("/api/integrations/linear", {
    method: "DELETE",
  });
}

export function fetchLinearIssues(): Promise<ListLinearIssuesResponse> {
  return request<ListLinearIssuesResponse>("/api/integrations/linear/issues");
}

// --- Webhook Logs ---

export function fetchWebhookLogs(params?: {
  limit?: number;
  offset?: number;
}): Promise<ListWebhookLogsResponse> {
  const query = new URLSearchParams();
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.offset) query.set("offset", String(params.offset));
  const qs = query.toString();
  return request<ListWebhookLogsResponse>(
    `/api/webhook-logs${qs ? `?${qs}` : ""}`,
  );
}

export { ApiError };
