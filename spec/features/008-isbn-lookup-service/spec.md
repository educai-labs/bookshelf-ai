# 008 · ISBN Lookup Service

**Estado:** hecho

## Qué hace

Permite a los usuarios buscar y obtener metadatos de un libro utilizando su ISBN-13. El usuario ingresa un ISBN y el sistema devuelve la información del libro incluyendo título, autores, portada, número de páginas, editorial y fecha de publicación. Este servicio es el punto de entrada para el alta de libros, evitando la entrada manual de datos y asegurando consistencia en los metadatos.

## Por qué

ISBN es la llave maestra para el alta de libros (decisión de la misión). Usar APIs externas (Open Library / Google Books) garantiza metadatos precis y consistentes sin depender de la precisión del usuario. El servicio está diseñado para ser el origen único de metadatos que luego serán usados por el catálogo, notas y funcionalidades de IA. El cacheo evita rate limits en las APIs externas y acelera la experiencia al repetir búsquedas del mismo libro.

## Criterios de aceptación

- [ ] Servicio responde con metadatos completos para ISBN-13 válidos en menos de 3 segundos (promedio).
- [ ] Open Library es la fuente primaria; Google Books es fallback automático cuando Open Library no retorna datos completos (sin título, sin autores, sin portada).
- [ ] El servicio normaliza automáticamente el ISBN eliminiendo guiones y espacios, validando que tenga exactamente 13 dígitos; si no es válido, lanza `InvalidISBNError`.
- [ ] Cuando ambas APIs fallan, lanza `ISBNNotFoundError` con mensaje descriptivo.
- [ ] Timeout de 5 segundos por petición HTTP; máximo 2 reintentos con backoff exponencial ante timeouts.
- [ ] Cache en memoria con TTL de 1 hora: segundo llamado idéntico retorna al instante (< 5ms).
- [ ] Los metadatos mapeados incluyen: title, authors (array de strings), cover_url (URL de miniatura), page_count, publisher, published_date, description.
- [ ] El endpoint `GET /api/v1/books/lookup?isbn=` (feature 009) integra y usa este servicio correctamente.
- [ ] Tests unitarios mockean respuestas de httpx: éxito Open Library, fallback Google Books, error en ambas, hit de cache.

## Fuera de alcance

- Endpoint API completo (feature 009: creación de libro con metadatos lookup).
- Persistencia de cache a Redis o disco — en memoria suficiente para MVP.
- Búsqueda por título, autor o palabra clave — feature futura (roadmap 018+).
- Rate limiting distribuido o por instancia — feature 020.
- Validación de ISBN-10 a ISBN-13 conversión — no requerida en esta historia.