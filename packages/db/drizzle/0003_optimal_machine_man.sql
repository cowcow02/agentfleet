CREATE TABLE "telemetry_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"dispatch_id" uuid NOT NULL,
	"organization_id" text NOT NULL,
	"event_type" text NOT NULL,
	"severity" text,
	"body" jsonb NOT NULL,
	"attributes" jsonb,
	"timestamp" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "telemetry_metrics" (
	"id" serial PRIMARY KEY NOT NULL,
	"dispatch_id" uuid NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"value" double precision NOT NULL,
	"unit" text,
	"attributes" jsonb,
	"timestamp" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "telemetry_spans" (
	"id" serial PRIMARY KEY NOT NULL,
	"dispatch_id" uuid NOT NULL,
	"organization_id" text NOT NULL,
	"trace_id" text NOT NULL,
	"span_id" text NOT NULL,
	"parent_span_id" text,
	"name" text NOT NULL,
	"kind" integer,
	"status" jsonb,
	"attributes" jsonb,
	"start_time" timestamp with time zone NOT NULL,
	"end_time" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dispatches" ADD COLUMN "usage" jsonb;--> statement-breakpoint
ALTER TABLE "telemetry_events" ADD CONSTRAINT "telemetry_events_dispatch_id_dispatches_id_fk" FOREIGN KEY ("dispatch_id") REFERENCES "public"."dispatches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telemetry_metrics" ADD CONSTRAINT "telemetry_metrics_dispatch_id_dispatches_id_fk" FOREIGN KEY ("dispatch_id") REFERENCES "public"."dispatches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telemetry_spans" ADD CONSTRAINT "telemetry_spans_dispatch_id_dispatches_id_fk" FOREIGN KEY ("dispatch_id") REFERENCES "public"."dispatches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_telemetry_events_dispatch" ON "telemetry_events" USING btree ("dispatch_id");--> statement-breakpoint
CREATE INDEX "idx_telemetry_events_org" ON "telemetry_events" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_telemetry_events_type" ON "telemetry_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "idx_telemetry_metrics_dispatch" ON "telemetry_metrics" USING btree ("dispatch_id");--> statement-breakpoint
CREATE INDEX "idx_telemetry_metrics_org" ON "telemetry_metrics" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_telemetry_metrics_name" ON "telemetry_metrics" USING btree ("name");--> statement-breakpoint
CREATE INDEX "idx_telemetry_spans_dispatch" ON "telemetry_spans" USING btree ("dispatch_id");--> statement-breakpoint
CREATE INDEX "idx_telemetry_spans_org" ON "telemetry_spans" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_telemetry_spans_trace" ON "telemetry_spans" USING btree ("trace_id");