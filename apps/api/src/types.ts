import type { Hono } from "hono";

/** Hono context variables set by auth middleware */
export type AppVariables = {
  user: any;
  session: any;
  organizationId: string;
};

export type AppEnv = {
  Variables: AppVariables;
};
