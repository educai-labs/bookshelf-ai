// Constante única de paginación del listado de libros (feature 030).
//
// Centraliza el tamaño de página del dashboard (SSR + cliente) para eliminar
// las definiciones duplicadas `DASHBOARD_PAGE_SIZE` (seed.ts) y
// `DEFAULT_PAGE_SIZE` (useBooks.ts) detectadas en la auditoría (Z1-05).
// El tamaño de paginación de las NOTAS es otro recurso y sigue siendo 50,
// por lo que no se mezcla aquí.

/** Tamaño de página del listado de libros (dashboard). */
export const PAGE_SIZE = 20;
