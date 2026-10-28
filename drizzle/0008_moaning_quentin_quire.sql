CREATE TABLE "strength_set" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"planned_workout_id" uuid NOT NULL,
	"exercise_id" text NOT NULL,
	"exercise_name" text NOT NULL,
	"position" integer NOT NULL,
	"reps" integer,
	"weight_kg" real,
	"seconds" integer,
	"done" boolean DEFAULT false NOT NULL,
	"date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "strength_set" ADD CONSTRAINT "strength_set_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strength_set" ADD CONSTRAINT "strength_set_planned_workout_id_planned_workout_id_fk" FOREIGN KEY ("planned_workout_id") REFERENCES "public"."planned_workout"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "strength_set_position" ON "strength_set" USING btree ("planned_workout_id","exercise_id","position");--> statement-breakpoint
CREATE INDEX "strength_set_history" ON "strength_set" USING btree ("user_id","exercise_name","date");