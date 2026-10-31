import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { StarRating } from "../StarRating";

describe("StarRating (primitivo único, feature 030 · Z3-11)", () => {
  it("renderiza estrellas readonly con role=img y tamaños coherentes", () => {
    const { container } = render(
      <StarRating value={3} ariaLabel="Rating: 3 de 5" />,
    );

    expect(
      screen.getByRole("img", { name: "Rating: 3 de 5" }),
    ).toBeInTheDocument();
    expect(container.querySelectorAll("svg.fill-amber-500")).toHaveLength(3);
    expect(container.querySelectorAll("svg.fill-muted")).toHaveLength(2);
  });

  it("aplica el mismo mapa de tamaños para sm/md/lg", () => {
    const sizes: Array<["sm" | "md" | "lg", string]> = [
      ["sm", "size-3"],
      ["md", "size-4"],
      ["lg", "size-5"],
    ];
    for (const [size, className] of sizes) {
      const { container, unmount } = render(
        <StarRating value={1} size={size} />,
      );
      expect(container.querySelector("svg")).toHaveClass(className);
      unmount();
    }
  });

  it("renderiza el modo interactivo como radiogroup con roles radio", () => {
    render(
      <StarRating
        interactive
        value={2}
        onChange={vi.fn()}
        ariaLabel="Rating"
      />,
    );

    const group = screen.getByRole("radiogroup", { name: "Rating" });
    expect(group.querySelectorAll("button")).toHaveLength(5);
    expect(screen.getAllByRole("radio")).toHaveLength(5);
  });

  it("notifica el valor 1-based al pulsar una estrella", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <StarRating
        interactive
        value={0}
        onChange={onChange}
        ariaLabel="Rating"
      />,
    );

    const buttons = screen.getAllByRole("radio");
    await user.click(buttons[2]!);

    expect(onChange).toHaveBeenCalledWith(3);
  });

  it("mueve el foco con ArrowRight/ArrowLeft sin loops", async () => {
    const user = userEvent.setup();
    render(
      <StarRating
        interactive
        value={0}
        onChange={vi.fn()}
        ariaLabel="Rating"
      />,
    );

    const buttons = screen.getAllByRole("radio");
    buttons[0]!.focus();
    await user.keyboard("{ArrowRight}");
    expect(buttons[1]).toHaveFocus();
    await user.keyboard("{ArrowLeft}");
    expect(buttons[0]).toHaveFocus();
  });
});
