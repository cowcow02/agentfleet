import { cors } from "hono/cors";

export const corsMiddleware = cors({
  origin: process.env.WEB_URL || "http://localhost:3000",
  credentials: true,
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
});
