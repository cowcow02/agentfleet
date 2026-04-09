CREATE TABLE "transcript_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"dispatch_id" uuid NOT NULL,
	"organization_id" text NOT NULL,
	"session_id" text NOT NULL,
	"event_type" text NOT NULL,
	"data" jsonb NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "transcript_events" ADD CONSTRAINT "transcript_events_dispatch_id_dispatches_id_fk" FOREIGN KEY ("dispatch_id") REFERENCES "public"."dispatches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_transcript_dispatch" ON "transcript_events" USING btree ("dispatch_id");--> statement-breakpoint
CREATE INDEX "idx_transcript_org_dispatch" ON "transcript_events" USING btree ("organization_id","dispatch_id");