/** Wrapper para DOMPurify - sanitiza HTML en el cliente. */

import DOMPurify from "dompurify";

/**
 * Sanitiza HTML permitiendo solo tags y atributos básicos de Markdown.
 * Configuración consistente con la del backend (bleach).
 */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      "p",
      "strong",
      "em",
      "code",
      "pre",
      "a",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "ul",
      "ol",
      "li",
      "blockquote",
      "br",
      "hr",
      "img",
    ],
    ALLOWED_ATTR: [
      "href",
      "title",
      "rel",
      "target",
      "src",
      "alt",
      "width",
      "height",
      "class",
      "id",
    ],
    ALLOWED_URI_REGEXP: /^(?:https?|mailto):/i,
    FORBID_TAGS: [
      "script",
      "style",
      "iframe",
      "object",
      "embed",
      "form",
      "input",
    ],
    FORBID_ATTR: [
      "onerror",
      "onload",
      "onclick",
      "onmouseover",
      "onfocus",
      "onblur",
    ],
    KEEP_CONTENT: true,
    RETURN_DOM: false,
    RETURN_DOM_FRAGMENT: false,
    RETURN_TRUSTED_TYPE: false,
  });
}
