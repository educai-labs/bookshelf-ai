import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SearchInput } from "../SearchInput";

vi.mock("@/lib/api/books", () => ({
  getBookSuggestions: vi.fn(() =>
    Promise.resolve({ query: "", limit: 8, items: [] }),
  ),
}));

describe("SearchInput", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls onChange with the debounced value after 300ms", () => {
    const onChange = vi.fn();
    render(<SearchInput value="" onChange={onChange} />);

    const input = screen.getByPlaceholderText("Buscar título o autor...");
    fireEvent.change(input, { target: { value: "harry" } });

    // Antes del debounce: onChange NO se ha llamado.
    expect(onChange).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("harry");
  });

  it("does not call onChange on every keystroke", () => {
    const onChange = vi.fn();
    render(<SearchInput value="" onChange={onChange} />);

    const input = screen.getByPlaceholderText("Buscar título o autor...");
    fireEvent.change(input, { target: { value: "h" } });
    fireEvent.change(input, { target: { value: "ha" } });
    fireEvent.change(input, { target: { value: "har" } });
    fireEvent.change(input, { target: { value: "harr" } });

    // Ningún onChange aún: solo se dispara con el valor estabilizado.
    expect(onChange).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(300);
    });

    // Una única llamada con el último valor, no una por keystroke.
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("harr");
  });

  it("resets the debounce timer on each keystroke", () => {
    const onChange = vi.fn();
    render(<SearchInput value="" onChange={onChange} />);

    const input = screen.getByPlaceholderText("Buscar título o autor...");
    fireEvent.change(input, { target: { value: "a" } });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    fireEvent.change(input, { target: { value: "ab" } });
    act(() => {
      vi.advanceTimersByTime(200);
    });

    // Tras 400ms acumulados pero con reseteo, aún sin llamada.
    expect(onChange).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("ab");
  });

  it("synchronizes from the value prop when it changes externally", () => {
    const onChange = vi.fn();
    const { rerender } = render(<SearchInput value="" onChange={onChange} />);
    const input = screen.getByPlaceholderText(
      "Buscar título o autor...",
    ) as HTMLInputElement;

    expect(input.value).toBe("");

    rerender(<SearchInput value="prefill" onChange={onChange} />);

    expect(input.value).toBe("prefill");
  });
});
