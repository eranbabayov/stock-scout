CREATE TYPE "public"."drawing_type" AS ENUM('trendline', 'ray', 'horizontal');--> statement-breakpoint
CREATE TABLE "chart_drawings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"type" "drawing_type" NOT NULL,
	"p1_date" date NOT NULL,
	"p1_price" double precision NOT NULL,
	"p2_date" date,
	"p2_price" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chart_drawings" ADD CONSTRAINT "chart_drawings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_chart_drawings_user_symbol" ON "chart_drawings" USING btree ("user_id","symbol");