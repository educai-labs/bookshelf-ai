# ============================================================
# Bookshelf API — Dockerfile multi-stage
# builder:  genera requirements.txt desde pyproject.toml e instala deps
# runtime:  python:3.11-slim, usuario no-root, healthcheck en /health
# ============================================================

# ---- Stage 1: builder ----------------------------------------------------
FROM python:3.11-slim AS builder

WORKDIR /build

# Genera requirements.txt desde pyproject.toml (PEP 621) y lo instala.
COPY pyproject.toml .
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir pip-tools \
    && pip-compile --no-header --no-emit-index-url -o requirements.txt pyproject.toml \
    && pip install --no-cache-dir --prefix=/install -r requirements.txt

# ---- Stage 2: runtime ------------------------------------------------------
FROM python:3.11-slim AS runtime

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Dependencias instaladas (sin build tools).
COPY --from=builder /install /usr/local

# Código de la aplicación.
COPY app ./app

# Usuario no-root.
RUN useradd --create-home --shell /bin/bash appuser
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:8000/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
