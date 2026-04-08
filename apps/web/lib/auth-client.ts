import { createAuthClient } from "better-auth/react";
import { organizationClient } from "better-auth/client/plugins";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:9900";

export const authClient = createAuthClient({
  baseURL: API_URL,
  plugins: [organizationClient()],
});

export const {
  useSession,
  signIn,
  signUp,
  signOut,
  organization,
} = authClient;

// API key management via direct REST calls (not available as client plugin)
export const apiKey = {
  async listApiKeys() {
    const res = await fetch(`${API_URL}/api/auth/api-key/list`, {
      credentials: "include",
    });
    if (!res.ok) return { data: null, error: { message: "Failed to list API keys" } };
    const data = await res.json();
    return { data, error: null };
  },
  async createApiKey(params: { name: string; expiresIn?: number }) {
    const res = await fetch(`${API_URL}/api/auth/api-key/create`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    if (!res.ok) return { data: null, error: { message: "Failed to create API key" } };
    const data = await res.json();
    return { data, error: null };
  },
  async deleteApiKey(params: { keyId: string }) {
    const res = await fetch(`${API_URL}/api/auth/api-key/delete`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    if (!res.ok) return { data: null, error: { message: "Failed to delete API key" } };
    const data = await res.json();
    return { data, error: null };
  },
};
