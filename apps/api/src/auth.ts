import { betterAuth } from "better-auth";
import { organization } from "better-auth/plugins";
import { bearer } from "better-auth/plugins/bearer";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@agentfleet/db";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  emailAndPassword: { enabled: true },
  trustedOrigins: [process.env.WEB_URL || "http://localhost:3000"],
  plugins: [
    organization(),
    bearer(),
  ],
});
