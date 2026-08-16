CREATE TABLE "telegram_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"telegram_chat_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "telegram_links_telegram_chat_id_unique" UNIQUE("telegram_chat_id")
);
--> statement-breakpoint
CREATE TABLE "telegram_otp_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"telegram_chat_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"code" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "telegram_links" ADD CONSTRAINT "telegram_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_otp_codes" ADD CONSTRAINT "telegram_otp_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_telegram_links_user_id" ON "telegram_links" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_telegram_otp_codes_chat_id" ON "telegram_otp_codes" USING btree ("telegram_chat_id");