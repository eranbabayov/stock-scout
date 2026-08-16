DROP INDEX "idx_user_trades_user_id";--> statement-breakpoint
CREATE INDEX "idx_user_trades_user_symbol" ON "user_trades" USING btree ("user_id","symbol");