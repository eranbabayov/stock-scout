DROP INDEX "idx_watchlist_list_items_list_id";--> statement-breakpoint
ALTER TABLE "watchlist_list_items" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_watchlist_list_items_list_id" ON "watchlist_list_items" USING btree ("list_id","sort_order");