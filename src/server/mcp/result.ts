import { ZodError } from "zod";
import { PlanEditError } from "@/lib/plan/edit";
import { PlanValidationError } from "../plans/service";
import { CoachingRevisionError } from "../profile/coaching";

/** Keep legacy text readable while exposing one consistent machine-readable MCP envelope. */
export function mcpText(data: unknown) {
  const record = data && typeof data === "object" ? data as Record<string, unknown> : {};
  const validation = record.validation && typeof record.validation === "object" ? record.validation as Record<string, unknown> : {};
  return {
    content: [{ type: "text" as const, text: typeof data === "string" ? data : JSON.stringify(data) }],
    structuredContent: { success: true, data: typeof data === "string" ? { message: data } : data,
      warnings: validation.warnings ?? record.warnings ?? [], errors: validation.errors ?? record.errors ?? [], ...(record.planRevision !== undefined ? { planRevision: record.planRevision } : {}) },
  };
}

export function mcpFail(message: string, errors: unknown[] = [{ code: "REQUEST", message }], warnings: unknown[] = []) {
  return { isError: true as const, content: [{ type: "text" as const, text: message }],
    structuredContent: { success: false, data: null, errors, warnings } };
}

export async function mcpGuard<T>(run: () => Promise<T>) {
  try { return await run(); }
  catch (error) {
    if (error instanceof PlanEditError || error instanceof CoachingRevisionError) return mcpFail(error.message, [{ code: "CONFLICT", message: error.message }]);
    if (error instanceof PlanValidationError) return mcpFail(`That would break the plan's rules:\n${error.result.errors.map(e => `- ${e.message}`).join("\n")}\nAdjust the change and try again.`, error.result.errors, error.result.warnings);
    if (error instanceof ZodError) return mcpFail("Some fields are invalid.", error.issues.map(i => ({ code: "SCHEMA", path: i.path.join("."), message: i.message })));
    throw error;
  }
}
