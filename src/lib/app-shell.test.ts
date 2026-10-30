import { describe, expect, it } from "vitest";
import { appShellClassName, tabBarInnerClassName } from "./app-shell";

describe("app shell layout", () => {
  it("keeps the phone-width shell until the desktop breakpoint", () => {
    expect(appShellClassName).toContain("max-w-md");
    expect(appShellClassName).toContain("lg:max-w-7xl");
  });

  it("expands the navigation with the desktop workspace", () => {
    expect(tabBarInnerClassName).toContain("max-w-md");
    expect(tabBarInnerClassName).toContain("lg:max-w-7xl");
  });
});
