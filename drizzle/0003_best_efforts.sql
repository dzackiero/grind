CREATE TABLE "activity_effort" (
	"user_id" text NOT NULL,
	"activity_id" text NOT NULL,
	"key" text NOT NULL,
	"seconds" real NOT NULL,
	CONSTRAINT "activity_effort_user_id_activity_id_key_pk" PRIMARY KEY("user_id","activity_id","key")
);
--> statement-breakpoint
ALTER TABLE "activity" ADD COLUMN "efforts_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "activity_effort" ADD CONSTRAINT "activity_effort_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_effort" ADD CONSTRAINT "activity_effort_user_id_activity_id_activity_user_id_id_fk" FOREIGN KEY ("user_id","activity_id") REFERENCES "public"."activity"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_effort_best" ON "activity_effort" USING btree ("user_id","key","seconds");