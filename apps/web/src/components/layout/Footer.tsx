/**
 * Footer del layout protegido (copyright).
 */
export function Footer() {
  return (
    <footer className="border-t py-4 text-center text-xs text-muted-foreground">
      © {new Date().getFullYear()} Bookshelf. Todos los derechos reservados.
    </footer>
  );
}
