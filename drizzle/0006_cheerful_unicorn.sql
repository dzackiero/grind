CREATE TABLE "historical_workout" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"request_key" text NOT NULL,
	"date" date NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"focus" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workout_activity" (
	"user_id" text NOT NULL,
	"activity_id" text NOT NULL,
	"planned_workout_id" uuid,
	"history_id" uuid,
	CONSTRAINT "workout_activity_user_id_activity_id_pk" PRIMARY KEY("user_id","activity_id"),
	CONSTRAINT "workout_activity_one_target" CHECK (("workout_activity"."planned_workout_id" IS NOT NULL) <> ("workout_activity"."history_id" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "historical_workout" ADD CONSTRAINT "historical_workout_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_activity" ADD CONSTRAINT "workout_activity_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_activity" ADD CONSTRAINT "workout_activity_planned_workout_id_planned_workout_id_fk" FOREIGN KEY ("planned_workout_id") REFERENCES "public"."planned_workout"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_activity" ADD CONSTRAINT "workout_activity_history_id_historical_workout_id_fk" FOREIGN KEY ("history_id") REFERENCES "public"."historical_workout"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_activity" ADD CONSTRAINT "workout_activity_user_id_activity_id_activity_user_id_id_fk" FOREIGN KEY ("user_id","activity_id") REFERENCES "public"."activity"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "historical_workout_user_request" ON "historical_workout" USING btree ("user_id","request_key");--> statement-breakpoint
CREATE INDEX "historical_workout_user_date" ON "historical_workout" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "workout_activity_planned" ON "workout_activity" USING btree ("planned_workout_id");--> statement-breakpoint
CREATE INDEX "workout_activity_history" ON "workout_activity" USING btree ("history_id");--> statement-breakpoint
-- Keep existing matched activities. If a legacy activity appears in several plans, prefer the active plan.
INSERT INTO "workout_activity" ("user_id", "activity_id", "planned_workout_id")
SELECT DISTINCT ON (w."user_id", w."activity_id") w."user_id", w."activity_id", w."id"
FROM "planned_workout" w
JOIN "activity" a ON a."user_id" = w."user_id" AND a."id" = w."activity_id"
JOIN "plan" p ON p."id" = w."plan_id"
WHERE w."activity_id" IS NOT NULL
ORDER BY w."user_id", w."activity_id", (p."status" = 'active') DESC, w."updated_at" DESC, w."id";
