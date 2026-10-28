import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  // Declare your Neon services here
  auth: false,
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
