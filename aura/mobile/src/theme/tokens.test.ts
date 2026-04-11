import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  Platform: { OS: "web" },
  useColorScheme: () => "dark",
}));

import { getTokens } from "@/src/theme/tokens";

describe("theme tokens", () => {
  it("stays light-first and exposes the new semantic aliases", () => {
    const tokens = getTokens("dark");

    expect(tokens.scheme).toBe("light");
    expect(tokens.colors.background).toBe("#F6F3EE");
    expect(tokens.colors.canvas).toBe(tokens.colors.background);
    expect(tokens.colors.surfaceSubtle).toBe(tokens.colors.surfaceElevated);
    expect(tokens.colors.primaryAction).toBe(tokens.colors.primary);
    expect(tokens.colors.safe).toBe(tokens.colors.success);
    expect(tokens.colors.textPrimary).toBe(tokens.colors.text);
    expect(tokens.colors.textSecondary).toBe(tokens.colors.textMuted);
  });
});
