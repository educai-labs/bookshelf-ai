/** Helper para insertar texto en la posición del cursor de un textarea. */

export function insertAtCursor(
  textarea: HTMLTextAreaElement,
  markdown: string,
): void {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const value = textarea.value;

  // Insertar el markdown en la posición del cursor
  textarea.value = value.slice(0, start) + markdown + value.slice(end);

  // Mover el cursor después del texto insertado
  const newPos = start + markdown.length;
  textarea.selectionStart = newPos;
  textarea.selectionEnd = newPos;

  // Disparar evento input para que React detecte el cambio
  textarea.dispatchEvent(new Event("input", { bubbles: true }));

  // Enfocar el textarea
  textarea.focus();
}
