import type {
  CreateDispatchRequest,
  CreateDispatchResponse,
  CreateProjectRequest,
  ListDispatchesResponse,
  DashboardStatsResponse,
  ListAgentsResponse,
  LinearConfigResponse,
  Project,
  UpdateLinearConfigRequest,
  ListLinearIssuesResponse,
  ListProjectsResponse,
  ListWebhookLogsResponse,
  Dispatch,
} from "@agentfleet/types";

// Uses relative URLs — Next.js rewrites proxy /api/* to the API server
const API_URL = "";

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

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
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

export function createDispatch(data: CreateDispatchRequest): Promise<CreateDispatchResponse> {
  return request<CreateDispatchResponse>("/api/dispatches", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// --- Agents ---

export function fetchAgents(): Promise<ListAgentsResponse> {
  return request<ListAgentsResponse>("/api/agents");
}

// --- Projects ---

export function fetchProjects(): Promise<ListProjectsResponse> {
  return request<ListProjectsResponse>("/api/projects");
}

export function createProject(data: CreateProjectRequest): Promise<Project> {
  return request<Project>("/api/projects", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// --- Linear Integration (project-scoped) ---

export function fetchLinearConfig(projectId: string): Promise<LinearConfigResponse> {
  return request<LinearConfigResponse>(`/api/projects/${projectId}/integrations/linear`);
}

export function updateLinearConfig(
  projectId: string,
  data: UpdateLinearConfigRequest,
): Promise<LinearConfigResponse> {
  return request<LinearConfigResponse>(`/api/projects/${projectId}/integrations/linear`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function deleteLinearConfig(projectId: string): Promise<void> {
  return request<void>(`/api/projects/${projectId}/integrations/linear`, {
    method: "DELETE",
  });
}

export function fetchLinearIssues(projectId: string): Promise<ListLinearIssuesResponse> {
  return request<ListLinearIssuesResponse>(`/api/projects/${projectId}/integrations/linear/issues`);
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
  return request<ListWebhookLogsResponse>(`/api/webhook-logs${qs ? `?${qs}` : ""}`);
}

export { ApiError };
