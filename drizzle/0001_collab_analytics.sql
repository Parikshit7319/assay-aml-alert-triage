CREATE TABLE "alert_notes" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"alert_id" text NOT NULL,
	"author_id" text,
	"author_name" text NOT NULL,
	"body" text NOT NULL,
	"mentions" text[] DEFAULT '{}'::text[] NOT NULL,
	"kind" text DEFAULT 'note' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"ts" timestamp with time zone DEFAULT now() NOT NULL,
	"event" text NOT NULL,
	"path" text NOT NULL,
	"label" text,
	"referrer_host" text,
	"device" text,
	"visitor" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alerts" ADD COLUMN "assignee_id" text;--> statement-breakpoint
ALTER TABLE "triage_runs" ADD COLUMN "prompt_version" text;--> statement-breakpoint
ALTER TABLE "alert_notes" ADD CONSTRAINT "alert_notes_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_notes" ADD CONSTRAINT "alert_notes_alert_id_alerts_id_fk" FOREIGN KEY ("alert_id") REFERENCES "public"."alerts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_notes" ADD CONSTRAINT "alert_notes_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notes_ws_alert_idx" ON "alert_notes" USING btree ("workspace_id","alert_id","created_at");--> statement-breakpoint
CREATE INDEX "analytics_ts_idx" ON "analytics_events" USING btree ("ts");--> statement-breakpoint
CREATE INDEX "analytics_event_ts_idx" ON "analytics_events" USING btree ("event","ts");--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_assignee_id_user_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "alerts_ws_assignee_idx" ON "alerts" USING btree ("workspace_id","assignee_id");