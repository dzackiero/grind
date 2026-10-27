CREATE TABLE "activity" (
	"user_id" text NOT NULL,
	"id" text NOT NULL,
	"date" date NOT NULL,
	"start_local" text NOT NULL,
	"type" text NOT NULL,
	"name" text,
	"distance_m" real,
	"moving_time_sec" integer,
	"elapsed_time_sec" integer,
	"avg_hr" real,
	"max_hr" real,
	"training_load" real,
	"elevation_gain_m" real,
	"raw" jsonb NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_user_id_id_pk" PRIMARY KEY("user_id","id")
);
--> statement-breakpoint
CREATE TABLE "wellness" (
	"user_id" text NOT NULL,
	"date" date NOT NULL,
	"resting_hr" real,
	"hrv" real,
	"sleep_secs" integer,
	"sleep_score" real,
	"readiness" real,
	"weight_kg" real,
	"ctl" real,
	"atl" real,
	"raw" jsonb NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wellness_user_id_date_pk" PRIMARY KEY("user_id","date")
);
--> statement-breakpoint
ALTER TABLE "athlete_profile" ADD COLUMN "intervals_athlete_name" text;--> statement-breakpoint
ALTER TABLE "athlete_profile" ADD COLUMN "last_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "athlete_profile" ADD COLUMN "last_sync_error" text;--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wellness" ADD CONSTRAINT "wellness_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_user_date" ON "activity" USING btree ("user_id","date");