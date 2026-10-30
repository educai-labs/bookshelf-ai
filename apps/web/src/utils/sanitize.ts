/** Wrapper para DOMPurify - sanitiza HTML en el cliente. */

import DOMPurify from "dompurify";

let externalLinkRelHookRegistered = false;

/**
 * Registra (una sola vez) el hook `afterSanitizeAttributes` de DOMPurify que
 * fuerza `rel="noopener noreferrer"` en todo enlace con `target="_blank"`
 * (hallazgo Z4-07). Es idempotente y defensivo ante mocks sin `addHook`.
 */
function ensureExternalLinkRel(): void {
  if (externalLinkRelHookRegistered) return;
  externalLinkRelHookRegistered = true;
  if (typeof DOMPurify.addHook !== "function") return;

  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (
      node.nodeName?.toLowerCase() === "a" &&
      node.getAttribute("target") === "_blank"
    ) {
      node.setAttribute("rel", "noopener noreferrer");
    }
  });
}

/**
 * Sanitiza HTML permitiendo solo tags y atributos básicos de Markdown.
 * Configuración consistente con la del backend (bleach).
 */
export function sanitizeHtml(html: string): string {
  ensureExternalLinkRel();
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
    // `target` es un atributo "inerte" (enum `_blank`/`_self`/…, no una URI):
    // DOMPurify v3 lo rechazaría en la comprobación de valor si no se marca
    // como URI-safe. Sin esto, `target="_blank"` se elimina y el hook no puede
    // añadir `rel` (hallazgo Z4-07).
    ADD_URI_SAFE_ATTR: ["target"],
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
