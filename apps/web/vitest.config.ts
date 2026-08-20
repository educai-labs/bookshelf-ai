import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      // Cobertura exigida: componentes auth de la feature 012 (≥ 80%).
      include: [
        "src/components/auth/**/*.{ts,tsx}",
        "src/components/dashboard/**/*.{ts,tsx}",
        "src/app/**/login/LoginForm.tsx",
        "src/app/**/register/RegisterForm.tsx",
        "src/lib/supabase/middleware.ts",
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        statements: 80,
        branches: 80,
      },
    },
  },
});
