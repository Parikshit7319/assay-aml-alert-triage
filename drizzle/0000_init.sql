CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alerts" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"external_id" text,
	"customer_id" text NOT NULL,
	"rule_code" text NOT NULL,
	"rule_description" text NOT NULL,
	"typology" text NOT NULL,
	"source" text NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"triggered_txn_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"sla_due_at" timestamp with time zone NOT NULL,
	"suspicion_determined_at" timestamp with time zone,
	"sar_due_at" timestamp with time zone,
	"l1_seconds" integer DEFAULT 0 NOT NULL,
	"l2_seconds" integer DEFAULT 0 NOT NULL,
	"latest_run_id" text,
	"decided_at" timestamp with time zone,
	"historical" boolean DEFAULT false NOT NULL,
	"agent_assisted" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"prefix" text NOT NULL,
	"hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"seq" bigserial PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"ts" timestamp with time zone NOT NULL,
	"actor_type" text NOT NULL,
	"actor_name" text NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"prev_hash" text NOT NULL,
	"hash" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"external_id" text,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"occupation" text,
	"country" text DEFAULT 'US' NOT NULL,
	"onboarded_at" timestamp with time zone,
	"risk_rating" text DEFAULT 'medium' NOT NULL,
	"expected_monthly_volume_cents" integer,
	"kyc_notes" text
);
--> statement-breakpoint
CREATE TABLE "decisions" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"alert_id" text NOT NULL,
	"run_id" text,
	"actor_type" text NOT NULL,
	"actor_name" text NOT NULL,
	"action" text NOT NULL,
	"reason_code" text,
	"note" text,
	"agreed_with_agent" boolean,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"company" text NOT NULL,
	"role" text,
	"segment" text,
	"monthly_alerts" integer,
	"monitoring_system" text,
	"message" text
);
--> statement-breakpoint
CREATE TABLE "metric_rollups" (
	"workspace_id" text NOT NULL,
	"week_start" text NOT NULL,
	"typology" text NOT NULL,
	"mode" text NOT NULL,
	"alerts" integer NOT NULL,
	"closes" integer NOT NULL,
	"escalations" integer NOT NULL,
	"sars_filed" integer NOT NULL,
	"l1_seconds" integer NOT NULL,
	"l2_seconds" integer NOT NULL,
	"recs_accepted" integer DEFAULT 0 NOT NULL,
	"recs_overridden" integer DEFAULT 0 NOT NULL,
	"qa_sampled" integer DEFAULT 0 NOT NULL,
	"qa_agreed" integer DEFAULT 0 NOT NULL,
	"missed_escalations" integer DEFAULT 0 NOT NULL,
	"synthetic" boolean DEFAULT false NOT NULL,
	CONSTRAINT "metric_rollups_workspace_id_week_start_typology_pk" PRIMARY KEY("workspace_id","week_start","typology")
);
--> statement-breakpoint
CREATE TABLE "prior_cases" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"kind" text NOT NULL,
	"opened_at" timestamp with time zone NOT NULL,
	"outcome" text NOT NULL,
	"summary" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qa_reviews" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"alert_id" text NOT NULL,
	"typology" text NOT NULL,
	"sampled_at" timestamp with time zone NOT NULL,
	"reviewer" text,
	"result" text,
	"note" text,
	"reviewed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"external_id" text,
	"ts" timestamp with time zone NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"direction" text NOT NULL,
	"channel" text NOT NULL,
	"counterparty_name" text,
	"counterparty_country" text,
	"branch" text,
	"memo" text
);
--> statement-breakpoint
CREATE TABLE "triage_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"alert_id" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone NOT NULL,
	"agent_identity" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"policy_version" integer NOT NULL,
	"outcome" text NOT NULL,
	"model_recommendation" text,
	"recommendation" text NOT NULL,
	"confidence" real NOT NULL,
	"risk_score" integer NOT NULL,
	"rationale" jsonb NOT NULL,
	"trace" jsonb NOT NULL,
	"policy_hits" jsonb NOT NULL,
	"validation" jsonb NOT NULL,
	"narrative" text,
	"auto_close_eligible" boolean DEFAULT false NOT NULL,
	"batch_eligible" boolean DEFAULT false NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost_micros" integer DEFAULT 0 NOT NULL,
	"cost_estimated" boolean DEFAULT false NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "usage_events" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"ts" timestamp with time zone NOT NULL,
	"period" text NOT NULL,
	"kind" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost_micros" integer DEFAULT 0 NOT NULL,
	"reported_to_stripe" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "watchlist_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"list_name" text NOT NULL,
	"country" text
);
--> statement-breakpoint
CREATE TABLE "workspace_members" (
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_members_workspace_id_user_id_pk" PRIMARY KEY("workspace_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"plan" text DEFAULT 'sandbox' NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"subscription_status" text,
	"settings" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_alert_id_alerts_id_fk" FOREIGN KEY ("alert_id") REFERENCES "public"."alerts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metric_rollups" ADD CONSTRAINT "metric_rollups_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prior_cases" ADD CONSTRAINT "prior_cases_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prior_cases" ADD CONSTRAINT "prior_cases_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qa_reviews" ADD CONSTRAINT "qa_reviews_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qa_reviews" ADD CONSTRAINT "qa_reviews_alert_id_alerts_id_fk" FOREIGN KEY ("alert_id") REFERENCES "public"."alerts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "triage_runs" ADD CONSTRAINT "triage_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "triage_runs" ADD CONSTRAINT "triage_runs_alert_id_alerts_id_fk" FOREIGN KEY ("alert_id") REFERENCES "public"."alerts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watchlist_entries" ADD CONSTRAINT "watchlist_entries_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "alerts_ws_status_idx" ON "alerts" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "alerts_ws_created_idx" ON "alerts" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "api_keys_hash_idx" ON "api_keys" USING btree ("hash");--> statement-breakpoint
CREATE INDEX "audit_ws_seq_idx" ON "audit_events" USING btree ("workspace_id","seq");--> statement-breakpoint
CREATE INDEX "customers_ws_idx" ON "customers" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "decisions_ws_idx" ON "decisions" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "cases_ws_customer_idx" ON "prior_cases" USING btree ("workspace_id","customer_id");--> statement-breakpoint
CREATE INDEX "qa_ws_idx" ON "qa_reviews" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "txn_ws_customer_idx" ON "transactions" USING btree ("workspace_id","customer_id","ts");--> statement-breakpoint
CREATE INDEX "runs_ws_alert_idx" ON "triage_runs" USING btree ("workspace_id","alert_id");--> statement-breakpoint
CREATE INDEX "usage_ws_period_idx" ON "usage_events" USING btree ("workspace_id","period");--> statement-breakpoint
CREATE INDEX "wl_ws_idx" ON "watchlist_entries" USING btree ("workspace_id");