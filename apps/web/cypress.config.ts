import { defineConfig } from "cypress";

export default defineConfig({
  e2e: {
    baseUrl: "http://localhost:3000",
    // Intercepta /api/v1/* para aislar el E2E del backend real (plan 013:
    // "cy.intercept para mock API; data-cy attributes; run en headless CI").
    defaultCommandTimeout: 10000,
    setupNodeEvents(_on, _config) {
      // Sin plugins extra por ahora (feature 013).
    },
  },
});
