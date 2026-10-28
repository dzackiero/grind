import "server-only";
import { ZodError } from "zod";
import { PlanEditError } from "@/lib/plan";
import { UnauthorizedError } from "./auth";
import { HabitError } from "./habits/service";
import { IntervalsError } from "./intervals/client";
import { PlanValidationError } from "./plans/service";
import { StrengthLogError } from "./strength/service";

/** Turns known errors into JSON responses with a clear message. */
export function errorResponse(error: unknown): Response {
  if (error instanceof UnauthorizedError) return Response.json({ error: error.message }, { status: 401 });
  if (error instanceof ZodError)
    return Response.json(
      { error: "Some fields are invalid.", issues: error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
      { status: 400 },
    );
  if (error instanceof StrengthLogError) return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof HabitError) return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof PlanEditError) return Response.json({ error: error.message }, { status: 409 });
  if (error instanceof PlanValidationError)
    return Response.json(
      { error: "The plan didn't pass its safety checks.", errors: error.result.errors, warnings: error.result.warnings },
      { status: 422 },
    );
  if (error instanceof IntervalsError)
    // Bad key / not connected → 400; rate limit → 429; intervals.icu down → 502
    return Response.json({ error: error.message }, { status: error.status === 429 ? 429 : [400, 401, 403, 404].includes(error.status) ? 400 : 502 });
  if (error instanceof SyntaxError) return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  console.error(error);
  return Response.json({ error: "Something went wrong on our side." }, { status: 500 });
}
