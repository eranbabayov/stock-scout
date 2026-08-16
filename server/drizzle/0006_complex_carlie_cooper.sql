CREATE TABLE "watchlist_list_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"list_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "watchlist_list_items_list_id_symbol_unique" UNIQUE("list_id","symbol")
);
--> statement-breakpoint
CREATE TABLE "watchlist_lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "watchlist_list_items" ADD CONSTRAINT "watchlist_list_items_list_id_watchlist_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."watchlist_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watchlist_lists" ADD CONSTRAINT "watchlist_lists_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_watchlist_list_items_list_id" ON "watchlist_list_items" USING btree ("list_id");--> statement-breakpoint
CREATE INDEX "idx_watchlist_lists_user_id" ON "watchlist_lists" USING btree ("user_id");--> statement-breakpoint
-- Data migration: existing watchlist stocks move into an auto-created
-- default list per user, so nothing is lost now that adds/removes require a
-- target list.
INSERT INTO "watchlist_lists" ("user_id", "name", "is_default")
SELECT DISTINCT "user_id", 'My Watchlist', true
FROM "user_stocks";--> statement-breakpoint
INSERT INTO "watchlist_list_items" ("list_id", "symbol", "added_at")
SELECT wl."id", us."symbol", us."added_at"
FROM "user_stocks" us
JOIN "watchlist_lists" wl ON wl."user_id" = us."user_id" AND wl."is_default" = true;