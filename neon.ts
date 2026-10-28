import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  auth: false,
  functions: {
    emailcron: {
      name: "Grind email scheduler",
      source: "src/functions/email-cron.ts",
      // Omit unset keys so normal local config evaluation works and existing
      // deployed secrets are preserved. The deployment script requires both.
      env: {
        ...(process.env.CRON_TARGET_URL ? { CRON_TARGET_URL: process.env.CRON_TARGET_URL } : {}),
        ...(process.env.CRON_SECRET ? { CRON_SECRET: process.env.CRON_SECRET } : {}),
      },
    },
  },
  triggers: {
    "email-every-15-minutes": {
      type: "schedule", function: "emailcron", functionPath: "/cron", cron: "*/15 * * * *",
      // Dev/preview and ordinary deploys stay disabled; enable only after a
      // production endpoint readiness check with matching CRON_SECRET.
      enabled: process.env.EMAIL_CRON_ENABLED === "true",
    },
  },
  // Branch policy: per-branch tuning
  branch: (branch) => {
    if (branch.isDefault) {
      // Default branch: no overrides, uses project defaults
      return {};
    }
    if (!branch.exists) {
      // The long-lived branch for local development stays; other new branches (previews, experiments) auto-expire
      // Run `neon checkout <name>` to create a new branch with these settings
      if (branch.name === "dev") return {};
      return { ttl: "7d" };
    }
    // Existing branch: no changes
    return {};
  },
});
