-- Current sql file was generated after introspecting the database
-- If you want to run this migration please uncomment this code before executing migrations
/*
CREATE TABLE "appointments" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_phone" text NOT NULL,
	"service_id" text NOT NULL,
	"service_title" text NOT NULL,
	"date" date NOT NULL,
	"time" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_appointments_user_phone" ON "appointments" USING btree ("user_phone" text_ops);
*/