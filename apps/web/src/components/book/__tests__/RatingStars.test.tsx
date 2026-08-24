import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RatingStars } from "../RatingStars";

describe("RatingStars", () => {
  it("renders the correct number of filled stars for a rating of 3", () => {
    const { container } = render(<RatingStars rating={3} />);

    expect(
      screen.getByRole("img", { name: "Rating: 3 de 5" }),
    ).toBeInTheDocument();
    expect(container.querySelectorAll("svg.fill-amber-500")).toHaveLength(3);
    expect(container.querySelectorAll("svg.fill-muted")).toHaveLength(2);
  });

  it("renders all stars grey when rating is null", () => {
    const { container } = render(<RatingStars rating={null} />);

    expect(
      screen.getByRole("img", { name: "Rating: 0 de 5" }),
    ).toBeInTheDocument();
    expect(container.querySelectorAll("svg.fill-amber-500")).toHaveLength(0);
    expect(container.querySelectorAll("svg.fill-muted")).toHaveLength(5);
  });

  it("respects a custom max", () => {
    const { container } = render(<RatingStars rating={2} max={3} />);

    expect(
      screen.getByRole("img", { name: "Rating: 2 de 3" }),
    ).toBeInTheDocument();
    expect(container.querySelectorAll("svg")).toHaveLength(3);
    expect(container.querySelectorAll("svg.fill-amber-500")).toHaveLength(2);
  });

  it("applies the size class", () => {
    const { container } = render(<RatingStars rating={5} size="sm" />);
    expect(container.querySelector("svg")).toHaveClass("size-3");
  });
});
