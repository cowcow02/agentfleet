import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().default(9900),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url().optional(),
  WEB_URL: z.string().url().optional().default("http://localhost:3000"),
});

export const env = envSchema.parse(process.env);
