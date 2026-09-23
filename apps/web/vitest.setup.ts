import "@testing-library/jest-dom";
import { vi } from "vitest";

// jsdom no implementa Pointer Events completos; Radix UI (Select, Tabs)
// necesita `hasPointerCapture`/`releasePointerCapture` en los targets.
// Polyfill estándar para tests (sin navegador real). Solo aplica en jsdom
// (los tests con `// @vitest-environment node` no tienen `Element`).
if (typeof Element !== "undefined" && !Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => undefined;
  Element.prototype.setPointerCapture = () => undefined;
}

// Radix Select hace scrollIntoView del item seleccionado al abrir el portal.
if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => undefined;
}

// Variables de entorno dummy para los clients Supabase (browser/server).
// Sin ellas, los clientes singleton lanzan error al importarse.
process.env.NEXT_PUBLIC_SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://test-project.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "test-anon-key";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next/headers", () => ({
  cookies: () => ({
    get: () => undefined,
    getAll: () => [],
    set: vi.fn(),
    delete: vi.fn(),
  }),
}));
