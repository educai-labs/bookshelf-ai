/* global cy, Cypress */
/// <reference types="cypress" />

/**
 * E2E del dashboard (feature 013).
 *
 * Flujo: login → /dashboard → grid visible → filtra status → busca →
 * carga más → click en card → navega a `/book/[id]`.
 *
 * Mocking (plan 013): `cy.intercept` para la API de Supabase (auth) y para
 * `/api/v1/books` — no depende del backend ni de credenciales reales.
 * Requiere las dependencias del sistema de Cypress (ver CI / README).
 */

/** Usuario dummy devuelto por Supabase Auth (intercept). */
const TEST_USER = {
  id: "00000000-0000-0000-0000-000000000001",
  email: "e2e@bookshelf.test",
  app_metadata: {},
  user_metadata: { name: "E2E Tester" },
  aud: "authenticated",
};

/** Respuesta de token para `signInWithPassword` (POST /auth/v1/token). */
function authTokenResponse() {
  return {
    access_token: "e2e-access-token",
    token_type: "bearer",
    expires_in: 3600,
    refresh_token: "e2e-refresh-token",
    user: TEST_USER,
  };
}

/** Construye una página de libros para `GET /api/v1/books`. */
function booksPage({
  page = 1,
  pageSize = 20,
  status,
  q,
  rating,
}: {
  page?: number;
  pageSize?: number;
  status?: string;
  q?: string;
  rating?: number;
}) {
  const all = Array.from({ length: 45 }, (_, i) => ({
    id: `e2e-book-${i + 1}`,
    user_id: TEST_USER.id,
    isbn13: `9780000000${String(i + 1).padStart(5, "0")}`,
    title: `Libro E2E ${i + 1}`,
    authors: ["Autora E2E"],
    cover_url: null,
    page_count: 200,
    publisher: "Editorial E2E",
    published_date: "2024-01-01",
    description: "Libro de prueba E2E",
    status: ["want_to_read", "reading", "read"][i % 3],
    rating: (i % 5) + 1,
    started_at: null,
    finished_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    notes_count: 0,
  }));

  const filtered = all.filter((b) => {
    if (status && b.status !== status) return false;
    if (q && !b.title.toLowerCase().includes(q.toLowerCase())) return false;
    if (rating && (b.rating ?? 0) !== rating) return false;
    return true;
  });
  const start = (page - 1) * pageSize;
  const items = filtered.slice(start, start + pageSize);

  return {
    items,
    total: filtered.length,
    page,
    page_size: pageSize,
    total_pages: Math.ceil(filtered.length / pageSize),
  };
}

/** Intercepta Supabase Auth (token + user) y la API de libros. */
function stubBackend() {
  cy.intercept("POST", "**/auth/v1/token*", (req) => {
    req.reply({
      statusCode: 200,
      body: authTokenResponse(),
    });
  }).as("authToken");

  cy.intercept("GET", "**/auth/v1/user*", (req) => {
    req.reply({
      statusCode: 200,
      body: TEST_USER,
    });
  }).as("authUser");

  cy.intercept("GET", "/api/v1/books*", (req) => {
    const url = new URL(req.url, "http://localhost:3000");
    req.reply({
      statusCode: 200,
      body: booksPage({
        page: Number(url.searchParams.get("page") ?? "1"),
        pageSize: Number(url.searchParams.get("page_size") ?? "20"),
        status: url.searchParams.get("status") ?? undefined,
        q: url.searchParams.get("q") ?? undefined,
        rating: Number(url.searchParams.get("rating") ?? 0) || undefined,
      }),
    });
  }).as("booksList");
}

describe("Dashboard Library Grid (E2E)", () => {
  beforeEach(() => {
    stubBackend();
    cy.visit("/login");
  });

  it("logs in, shows the grid, filters, searches, loads more and navigates to a book", () => {
    // --- Login (email/password mockeado vía intercept de token) ---
    cy.get('input[id="email"]').type("e2e@bookshelf.test");
    cy.get('input[id="password"]').type("password123");
    cy.get('button[type="submit"]').click();
    cy.wait("@authToken");

    // El submit navega a /dashboard; el middleware y el Server Component
    // validan la sesión vía GET /auth/v1/user (interceptado).
    cy.url().should("include", "/dashboard", { timeout: 10000 });
    cy.wait("@authUser");

    // --- Grid visible con cards de la primera página ---
    cy.get('[data-testid="books-grid"]', { timeout: 10000 }).should(
      "be.visible",
    );
    cy.contains('[data-testid="books-grid"]', "Libro E2E 1").should(
      "be.visible",
    );

    // --- Filtro por status (tab "Leyendo") → request con status=reading ---
    cy.contains('button[role="tab"]', "Leyendo").click();
    cy.wait("@booksList")
      .its("request.url")
      .should("contain", "status=reading");

    // --- Búsqueda debounced (300ms) → request con q ---
    cy.get('input[aria-label="Buscar título o autor"]').type("Libro E2E 10");
    cy.wait("@booksList", { timeout: 10000 })
      .its("request.url")
      .should("contain", "q=Libro%20E2E%2010");

    // --- Cargar más (paginación, append) ---
    cy.contains("button", "Cargar más").click();
    cy.wait("@booksList").its("request.url").should("contain", "page=2");

    // --- Click en card → navega a /book/[id] ---
    cy.contains('[data-testid="books-grid"]', "Libro E2E 10").click();
    cy.url({ timeout: 10000 }).should("match", /\/book\/e2e-book-\d+/);
  });

  it("shows the empty state when the library has no books", () => {
    cy.intercept("GET", "/api/v1/books*", {
      statusCode: 200,
      body: {
        items: [],
        total: 0,
        page: 1,
        page_size: 20,
        total_pages: 0,
      },
    }).as("booksEmpty");

    cy.get('input[id="email"]').type("e2e@bookshelf.test");
    cy.get('input[id="password"]').type("password123");
    cy.get('button[type="submit"]').click();
    cy.wait("@authToken");

    cy.url().should("include", "/dashboard", { timeout: 10000 });
    cy.contains("Tu biblioteca está vacía", { timeout: 10000 }).should(
      "be.visible",
    );
    cy.get('[data-testid="add-first-book"]').should("be.visible");
  });

  it("redirects unauthenticated users from /dashboard to /login", () => {
    // Sin cookies de sesión → middleware redirige.
    cy.clearCookies();
    cy.visit("/dashboard");
    cy.url().should("include", "/login", { timeout: 10000 });
    cy.url().should("contain", "redirectTo=%2Fdashboard");
  });

  // Nota (CI): ejecutar `npm run test:e2e` con `cypress run` requiere el
  // servidor de dev levantado (`npm run dev`) y las dependencias del sistema
  // de Cypress (libgtk, libnss3...). El test está aislado del backend real
  // vía intercept, así que no necesita Supabase ni la API FastAPI.
});
