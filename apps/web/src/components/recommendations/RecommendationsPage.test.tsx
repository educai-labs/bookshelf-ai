import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { translate } from "@/lib/i18n";
import { RecommendationsPage } from "./RecommendationsPage";

const mocks = vi.hoisted(() => ({
  getRecommendations: vi.fn(),
}));

vi.mock("@/lib/api/recommendations", () => ({
  getRecommendations: mocks.getRecommendations,
}));

const ITEMS = [
  {
    title: "El nombre del viento",
    authors: ["Patrick Rothfuss"],
    reason: "Por su mundo rico.",
    confidence: 0.87,
  },
  {
    title: "Dune",
    authors: ["Frank Herbert"],
    reason: "Por su épica de ciencia ficción.",
    confidence: 0.64,
  },
];

beforeEach(() => {
  mocks.getRecommendations.mockReset();
});

describe("RecommendationsPage", () => {
  it("muestra el skeleton mientras carga", () => {
    mocks.getRecommendations.mockReturnValue(new Promise(() => {}));

    render(<RecommendationsPage />);

    expect(screen.getByTestId("recommendations-skeleton")).toBeInTheDocument();
  });

  it("renderiza título, autores, razón y badge de confidence", async () => {
    mocks.getRecommendations.mockResolvedValue({ recommendations: ITEMS });

    render(<RecommendationsPage />);

    expect(
      await screen.findByTestId("recommendations-grid"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Recomendaciones" }),
    ).toBeInTheDocument();
    expect(screen.getByText("El nombre del viento")).toBeInTheDocument();
    expect(screen.getByText("Patrick Rothfuss")).toBeInTheDocument();
    expect(screen.getByText("Por su mundo rico.")).toBeInTheDocument();
    expect(screen.getByText("87%")).toBeInTheDocument();
    expect(screen.getByText("64%")).toBeInTheDocument();
  });

  it("muestra el estado vacío cuando no hay recomendaciones", async () => {
    mocks.getRecommendations.mockResolvedValue({ recommendations: [] });

    render(<RecommendationsPage />);

    expect(
      await screen.findByTestId("recommendations-empty"),
    ).toBeInTheDocument();
    expect(screen.getByText("Aún no hay recomendaciones")).toBeInTheDocument();
  });

  it("muestra error y reintenta sin recargar", async () => {
    mocks.getRecommendations
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ recommendations: ITEMS });
    const user = userEvent.setup();

    render(<RecommendationsPage />);

    const retry = await screen.findByTestId("recommendations-retry");
    expect(screen.getByTestId("recommendations-error")).toBeInTheDocument();

    await user.click(retry);

    expect(
      await screen.findByTestId("recommendations-grid"),
    ).toBeInTheDocument();
    expect(mocks.getRecommendations).toHaveBeenCalledTimes(2);
  });

  it("aplica roles y aria-live para accesibilidad", async () => {
    mocks.getRecommendations.mockResolvedValue({ recommendations: ITEMS });
    const { container } = render(<RecommendationsPage />);

    await screen.findByTestId("recommendations-grid");

    expect(screen.getByRole("grid")).toBeInTheDocument();
    expect(screen.getAllByRole("gridcell")).toHaveLength(2);
    expect(container.querySelector('[aria-live="polite"]')).not.toBeNull();
  });

  it("expone aria-label traducido en el badge de confidence", async () => {
    mocks.getRecommendations.mockResolvedValue({ recommendations: ITEMS });

    render(<RecommendationsPage />);

    await screen.findByTestId("recommendations-grid");

    expect(
      screen.getByRole("gridcell", { name: /Confianza: 87%/ }),
    ).toBeInTheDocument();
  });

  it("i18n: las claves de recomendaciones existen en es y en", () => {
    expect(translate("es", "recommendations.title")).toBe("Recomendaciones");
    expect(translate("en", "recommendations.title")).toBe("Recommendations");
    expect(
      translate("en", "recommendations.confidenceAria", { value: 87 }),
    ).toBe("Confidence: 87%");
    expect(translate("es", "sidebar.recommendations")).toBe("Recomendaciones");
    expect(translate("en", "sidebar.recommendations")).toBe("Recommendations");
  });
});
