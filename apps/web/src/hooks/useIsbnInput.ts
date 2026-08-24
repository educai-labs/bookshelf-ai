"use client";

import { useState, useCallback } from "react";

/**
 * Hook para manejar input de ISBN-13.
 * Normaliza a solo dígitos, valida longitud (13), y formatea para display.
 *
 * Formato display: 978-X-XXX-XXXXX-X (grupos: 3-1-3-5-1)
 */
export function useIsbnInput() {
  const [isbn, setIsbn] = useState("");
  const [formattedIsbn, setFormattedIsbn] = useState("");

  const isValid = isbn.length === 13;

  const formatIsbn = useCallback((digits: string): string => {
    // ISBN-13 format: 978-X-XXX-XXXXX-X (3-1-3-5-1)
    if (digits.length <= 3) return digits;
    if (digits.length <= 4) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    if (digits.length <= 7)
      return `${digits.slice(0, 3)}-${digits.slice(3, 4)}-${digits.slice(4)}`;
    if (digits.length <= 12)
      return `${digits.slice(0, 3)}-${digits.slice(3, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 4)}-${digits.slice(4, 7)}-${digits.slice(7, 12)}-${digits.slice(12, 13)}`;
  }, []);

  const onChange = useCallback(
    (raw: string) => {
      const digits = raw.replace(/\D/g, "").slice(0, 13);
      setIsbn(digits);
      setFormattedIsbn(formatIsbn(digits));
    },
    [formatIsbn],
  );

  const reset = useCallback(() => {
    setIsbn("");
    setFormattedIsbn("");
  }, []);

  return {
    isbn,
    formattedIsbn,
    isValid,
    onChange,
    reset,
  };
}
