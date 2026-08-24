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
    testTimeout: 10000, // Aborta tests individuales que tarden más de 10s
    hookTimeout: 10000, // Aborta hooks (beforeEach/afterEach) colgados
    bail: 1, // Detiene la suite completa al primer fallo para no acumular procesos
    pool: "threads",
    poolOptions: {
      threads: {
        maxThreads: 2, // Limita a 2 workers máximo (en lugar de 4 u 8)
        minThreads: 1,
      },
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
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
