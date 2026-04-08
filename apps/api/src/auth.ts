import { betterAuth } from "better-auth";
import { organization } from "better-auth/plugins";
import { bearer } from "better-auth/plugins/bearer";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db, authSchema } from "@agentfleet/db";

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:9900",
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: authSchema,
  }),
  emailAndPassword: { enabled: true },
  trustedOrigins: [process.env.WEB_URL || "http://localhost:3000"],
  plugins: [
    organization(),
    bearer(),
  ],
});
