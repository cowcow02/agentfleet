import { createHash } from "node:crypto";
import { db, apiKeys } from "@agentfleet/db";
import { eq } from "drizzle-orm";

function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/**
 * Resolve a Bearer token that starts with "afk_" to an API key record.
 * Returns { organizationId, userId } or null.
 */
export async function resolveApiKey(
  token: string,
): Promise<{ organizationId: string; userId: string } | null> {
  if (!token.startsWith("afk_")) return null;

  const keyHash = hashKey(token);
  const [row] = await db
    .select({
      organizationId: apiKeys.organizationId,
      userId: apiKeys.userId,
    })
    .from(apiKeys)
    .where(eq(apiKeys.keyHash, keyHash))
    .limit(1);

  return row ?? null;
}
