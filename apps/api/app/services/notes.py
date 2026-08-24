"""Servicios de notas (feature 015).

Helper para renderizar Markdown a HTML sanitizado.
"""

import bleach
import markdown2

# Tags permitidos para contenido Markdown renderizado (whitelist)
ALLOWED_TAGS = [
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
]

# Atributos permitidos por tag
ALLOWED_ATTRIBUTES = {
    "a": ["href", "title", "rel"],
    "img": ["src", "alt", "title", "width", "height"],
    "code": ["class"],
    "pre": ["class"],
    "*": ["class", "id"],
}

# Protocolos permitidos para URLs
ALLOWED_PROTOCOLS = ["http", "https", "mailto"]


def render_markdown_to_html(content: str) -> str:
    """
    Convierte Markdown a HTML y lo sanitiza con bleach.

    Args:
        content: Texto en formato Markdown.

    Returns:
        HTML sanitizado seguro para renderizar en el navegador.
    """
    # markdown2 convierte Markdown a HTML
    html = markdown2.markdown(content, extras=["fenced-code-blocks", "tables", "strike"])

    # bleach sanitiza el HTML: elimina tags/atributos no permitidos
    sanitized = bleach.clean(
        html,
        tags=ALLOWED_TAGS,
        attributes=ALLOWED_ATTRIBUTES,
        protocols=ALLOWED_PROTOCOLS,
        strip=True,
    )

    # Añadir rel="noopener noreferrer" a enlaces externos por seguridad
    sanitized = bleach.linkify(
        sanitized,
        callbacks=[_add_noopener],
        skip_tags=["pre", "code"],
        parse_email=True,
    )

    return sanitized


def _add_noopener(attrs, new=False):
    """Callback para bleach.linkify: añade rel=noopener noreferrer a enlaces http(s)."""
    href = attrs.get((None, "href"), "")
    if href.startswith(("http://", "https://")):
        attrs[(None, "rel")] = "noopener noreferrer"
        attrs[(None, "target")] = "_blank"
    return attrs
