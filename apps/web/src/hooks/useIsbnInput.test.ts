import { renderHook, act } from "@testing-library/react";
import { useIsbnInput } from "./useIsbnInput";

describe("useIsbnInput", () => {
  it("inicializa con valores vacíos", () => {
    const { result } = renderHook(() => useIsbnInput());
    expect(result.current.isbn).toBe("");
    expect(result.current.formattedIsbn).toBe("");
    expect(result.current.isValid).toBe(false);
  });

  it("normaliza input quitando no-dígitos", () => {
    const { result } = renderHook(() => useIsbnInput());

    act(() => {
      result.current.onChange("978-0-123-45678-9");
    });

    expect(result.current.isbn).toBe("9780123456789");
    expect(result.current.formattedIsbn).toBe("978-0-123-45678-9");
    expect(result.current.isValid).toBe(true);
  });

  it("normaliza input con espacios y caracteres especiales", () => {
    const { result } = renderHook(() => useIsbnInput());

    act(() => {
      result.current.onChange(" 978 0 123 45678 9 ");
    });

    expect(result.current.isbn).toBe("9780123456789");
    expect(result.current.isValid).toBe(true);
  });

  it("trunca a 13 dígitos si se pasan más", () => {
    const { result } = renderHook(() => useIsbnInput());

    act(() => {
      result.current.onChange("97801234567890123");
    });

    expect(result.current.isbn).toBe("9780123456789");
    expect(result.current.isValid).toBe(true);
  });

  it("valida longitud exacta de 13 dígitos", () => {
    const { result } = renderHook(() => useIsbnInput());

    act(() => {
      result.current.onChange("978012345678");
    });
    expect(result.current.isValid).toBe(false);

    act(() => {
      result.current.onChange("9780123456789");
    });
    expect(result.current.isValid).toBe(true);

    act(() => {
      result.current.onChange("97801234567890");
    });
    expect(result.current.isValid).toBe(true); // truncado a 13
  });

  it("formatea progresivamente mientras se escribe", () => {
    const { result } = renderHook(() => useIsbnInput());

    act(() => {
      result.current.onChange("9");
    });
    expect(result.current.formattedIsbn).toBe("9");

    act(() => {
      result.current.onChange("97");
    });
    expect(result.current.formattedIsbn).toBe("97");

    act(() => {
      result.current.onChange("978");
    });
    expect(result.current.formattedIsbn).toBe("978");

    act(() => {
      result.current.onChange("9780");
    });
    expect(result.current.formattedIsbn).toBe("978-0");

    act(() => {
      result.current.onChange("97801");
    });
    expect(result.current.formattedIsbn).toBe("978-0-1");

    act(() => {
      result.current.onChange("978012");
    });
    expect(result.current.formattedIsbn).toBe("978-0-12");

    act(() => {
      result.current.onChange("9780123");
    });
    expect(result.current.formattedIsbn).toBe("978-0-123");

    act(() => {
      result.current.onChange("97801234");
    });
    expect(result.current.formattedIsbn).toBe("978-0-123-4");

    act(() => {
      result.current.onChange("978012345");
    });
    expect(result.current.formattedIsbn).toBe("978-0-123-45");

    act(() => {
      result.current.onChange("9780123456");
    });
    expect(result.current.formattedIsbn).toBe("978-0-123-456");

    act(() => {
      result.current.onChange("97801234567");
    });
    expect(result.current.formattedIsbn).toBe("978-0-123-4567");

    act(() => {
      result.current.onChange("978012345678");
    });
    expect(result.current.formattedIsbn).toBe("978-0-123-45678");

    act(() => {
      result.current.onChange("9780123456789");
    });
    expect(result.current.formattedIsbn).toBe("978-0-123-45678-9");
  });

  it("reset limpia el estado", () => {
    const { result } = renderHook(() => useIsbnInput());

    act(() => {
      result.current.onChange("9780123456789");
    });
    expect(result.current.isbn).toBe("9780123456789");
    expect(result.current.isValid).toBe(true);

    act(() => {
      result.current.reset();
    });

    expect(result.current.isbn).toBe("");
    expect(result.current.formattedIsbn).toBe("");
    expect(result.current.isValid).toBe(false);
  });
});
