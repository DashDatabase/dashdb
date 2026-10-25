CREATE TYPE "public"."db_dialect" AS ENUM('postgres', 'mysql');--> statement-breakpoint
CREATE TABLE "connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"dialect" "db_dialect" NOT NULL,
	"host" text NOT NULL,
	"database" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
