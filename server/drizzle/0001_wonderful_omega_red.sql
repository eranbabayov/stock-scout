CREATE TYPE "public"."trade_direction" AS ENUM('long', 'short');--> statement-breakpoint
ALTER TABLE "user_trades" ADD COLUMN "direction" "trade_direction" DEFAULT 'long' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_trades" ADD COLUMN "quantity" double precision DEFAULT 1 NOT NULL;