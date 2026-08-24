"use client";

import { useDeferredValue, useEffect, useState } from "react";

/**
 * Hook genérico de debounce: devuelve `value` "estabilizado" tras `delay` ms
 * sin cambios. Combina `useDeferredValue` (React 18 concurrent, no bloquea
 * render) con `useEffect` + `setTimeout` (retardo explícito y cancelable).
 *
 * Uso típico: debounce de búsqueda (feature 013) — evita un `fetch` por
 * keystroke mientras el usuario escribe.
 */
export function useDebounce<T>(value: T, delay: number = 300): T {
  // useDeferredValue permite que React priorice el render de la UI mientras
  // el valor "real" aún está estabilizándose.
  const deferred = useDeferredValue(value);
  const [debounced, setDebounced] = useState(deferred);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(deferred);
    }, delay);
    return () => clearTimeout(timer);
  }, [deferred, delay]);

  return debounced;
}
