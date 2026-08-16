CREATE TABLE "agent_playbook" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trigger_summary" text NOT NULL,
	"rule_text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "telegram_links" ADD COLUMN "last_active_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "telegram_links" ADD COLUMN "pending_action_text" text;--> statement-breakpoint
CREATE INDEX "idx_agent_playbook_created_at" ON "agent_playbook" USING btree ("created_at" DESC NULLS LAST);