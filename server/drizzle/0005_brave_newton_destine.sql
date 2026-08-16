CREATE TYPE "public"."alert_direction" AS ENUM('above', 'below');--> statement-breakpoint
CREATE TYPE "public"."alert_kind" AS ENUM('price', 'moving_average');--> statement-breakpoint
CREATE TYPE "public"."alert_status" AS ENUM('active', 'triggered');--> statement-breakpoint
CREATE TYPE "public"."moving_average_type" AS ENUM('EMA', 'SMA');--> statement-breakpoint
CREATE TABLE "stock_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"kind" "alert_kind" NOT NULL,
	"target_price" double precision,
	"indicator_type" "moving_average_type",
	"indicator_period" integer,
	"direction" "alert_direction" NOT NULL,
	"status" "alert_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"triggered_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "stock_alerts" ADD CONSTRAINT "stock_alerts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_stock_alerts_status_symbol" ON "stock_alerts" USING btree ("status","symbol");