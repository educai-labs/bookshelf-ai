import "@testing-library/jest-dom";
import { vi } from "vitest";

// Variables de entorno dummy para los clients Supabase (browser/server).
// Sin ellas, los clientes singleton lanzan error al importarse.
process.env.NEXT_PUBLIC_SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://test-project.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "test-anon-key";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
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
