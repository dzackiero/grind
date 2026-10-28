ALTER TABLE "athlete_profile" ADD COLUMN "coaching" jsonb DEFAULT '{"preferences":{},"constraints":{}}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "athlete_profile" ADD COLUMN "coaching_revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "plan_change" ADD COLUMN "base_revision" integer;--> statement-breakpoint
ALTER TABLE "plan_change" ADD COLUMN "coaching_revision" integer DEFAULT 0 NOT NULL;