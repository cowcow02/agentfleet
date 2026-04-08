import { Hono } from "hono";
import type { AppEnv } from "../types";
import { randomBytes, createHash } from "node:crypto";
import { db, apiKeys } from "@agentfleet/db";
import { eq, and } from "drizzle-orm";

export const apiKeysRouter = new Hono<AppEnv>();

function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

function generateKey(): string {
  return "afk_" + randomBytes(24).toString("hex");
}

// Create API key
apiKeysRouter.post("/api/api-keys/create", async (c) => {
  const orgId = c.get("organizationId") as string;
  const user = c.get("user") as { id: string };
  const body = await c.req.json<{ name: string }>();

  if (!body.name) {
    return c.json({ error: "Name is required" }, 400);
  }

  const key = generateKey();
  const keyHash = hashKey(key);
  const prefix = key.slice(0, 12);

  const [row] = await db
    .insert(apiKeys)
    .values({
      organizationId: orgId,
      userId: user.id,
      name: body.name,
      keyHash,
      prefix,
    })
    .returning();

  return c.json({ key, id: row.id, name: row.name, createdAt: row.createdAt });
});

// List API keys
apiKeysRouter.get("/api/api-keys/list", async (c) => {
  const orgId = c.get("organizationId") as string;

  const keys = await db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      prefix: apiKeys.prefix,
      createdAt: apiKeys.createdAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.organizationId, orgId));

  return c.json(keys);
});

// Delete API key
apiKeysRouter.post("/api/api-keys/delete", async (c) => {
  const orgId = c.get("organizationId") as string;
  const body = await c.req.json<{ keyId: string }>();

  if (!body.keyId) {
    return c.json({ error: "keyId is required" }, 400);
  }

  await db
    .delete(apiKeys)
    .where(and(eq(apiKeys.id, body.keyId), eq(apiKeys.organizationId, orgId)));

  return c.json({ success: true });
});
