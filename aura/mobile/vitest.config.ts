import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": decodeURIComponent(new URL(".", import.meta.url).pathname),
      "react-native": decodeURIComponent(
        new URL("./test/react-native.ts", import.meta.url).pathname
      ),
    },
  },
  test: {
    environment: "node",
    setupFiles: ["./test/setup.ts"],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    clearMocks: true,
    restoreMocks: true,
  },
});
