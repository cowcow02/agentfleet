CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"tracker_type" text,
	"tracker_config" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_projects_org" ON "projects" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_projects_org_slug" ON "projects" USING btree ("organization_id","slug");