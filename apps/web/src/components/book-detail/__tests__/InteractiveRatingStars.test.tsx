import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { InteractiveRatingStars } from "../InteractiveRatingStars";

describe("InteractiveRatingStars", () => {
  it("mueve el foco a la derecha con ArrowRight y a la izquierda con ArrowLeft", async () => {
    const user = userEvent.setup();
    render(
      <InteractiveRatingStars
        rating={null}
        onChange={vi.fn()}
        ariaLabel="Rating"
      />,
    );

    const buttons = screen.getAllByRole("radio");
    buttons[0]!.focus();

    await user.keyboard("{ArrowRight}");
    expect(buttons[1]).toHaveFocus();

    await user.keyboard("{ArrowRight}");
    expect(buttons[2]).toHaveFocus();

    await user.keyboard("{ArrowLeft}");
    expect(buttons[1]).toHaveFocus();
  });

  it("no deja el foco clavado en los extremos (sin loops)", async () => {
    const user = userEvent.setup();
    render(
      <InteractiveRatingStars
        rating={null}
        onChange={vi.fn()}
        ariaLabel="Rating"
      />,
    );

    const buttons = screen.getAllByRole("radio");

    // Extremo izquierdo: ArrowLeft mantiene el foco en la primera estrella.
    buttons[0]!.focus();
    await user.keyboard("{ArrowLeft}");
    expect(buttons[0]).toHaveFocus();

    // Extremo derecho: ArrowRight mantiene el foco en la última estrella.
    buttons[4]!.focus();
    await user.keyboard("{ArrowRight}");
    expect(buttons[4]).toHaveFocus();
  });

  it("activa el rating con Enter", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<InteractiveRatingStars rating={null} onChange={onChange} />);

    const buttons = screen.getAllByRole("radio");
    buttons[2]!.focus();
    await user.keyboard("{Enter}");

    expect(onChange).toHaveBeenCalledWith(3);
  });

  it("activa el rating con Espacio", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<InteractiveRatingStars rating={null} onChange={onChange} />);

    const buttons = screen.getAllByRole("radio");
    buttons[1]!.focus();
    await user.keyboard(" ");

    expect(onChange).toHaveBeenCalledWith(2);
  });

  it("usa el mapa de tamaños compartido (sm = size-3, coherente con RatingStars)", () => {
    const { container } = render(
      <InteractiveRatingStars rating={3} onChange={vi.fn()} size="sm" />,
    );

    expect(container.querySelector("svg")).toHaveClass("size-3");
  });

  it("borra el rating al pulsar la misma estrella llena", () => {
    const onChange = vi.fn();
    render(<InteractiveRatingStars rating={3} onChange={onChange} />);

    const buttons = screen.getAllByRole("radio");
    fireEvent.click(buttons[2]!);

    expect(onChange).toHaveBeenCalledWith(null);
  });
});
