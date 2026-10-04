# ============================================================
# Bookshelf API — Dockerfile multi-stage
# builder:  genera requirements.txt desde pyproject.toml e instala deps
#           en un entorno virtual aislado (/opt/venv)
# runtime:  python:3.11-slim, usuario no-root, healthcheck en /health
# ============================================================

# ---- Stage 1: builder ----------------------------------------------------
FROM python:3.11-slim AS builder

WORKDIR /build

# Entorno Python aislado. Es imprescindible: `pip-tools` (necesario para
# `pip-compile`) arrastra `click` como dependencia. Si se instalara en el
# site-packages del sistema y luego se usara `pip install --prefix=/install`,
# pip daría `click` por "ya instalado" y NO lo copiaría a la imagen runtime,
# provocando `ModuleNotFoundError: No module named 'click'` al arrancar uvicorn.
# Con el venv, pip-tools y TODAS las dependencias del proyecto (incluido `click`
# y `h11` de uvicorn) quedan juntas en /opt/venv y se copian íntegras al runtime.
ENV VIRTUAL_ENV=/opt/venv
RUN python -m venv "$VIRTUAL_ENV"
ENV PATH="$VIRTUAL_ENV/bin:$PATH"

# Genera requirements.txt desde pyproject.toml (PEP 621) y lo instala.
COPY pyproject.toml .
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir pip-tools \
    && pip-compile --no-header --no-emit-index-url -o requirements.txt pyproject.toml \
    && pip install --no-cache-dir -r requirements.txt

# ---- Stage 2: runtime ------------------------------------------------------
FROM python:3.11-slim AS runtime

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    VIRTUAL_ENV=/opt/venv \
    PATH="/opt/venv/bin:$PATH"

# Entorno Python con TODAS las dependencias (incluido click/h11 de uvicorn).
# Se copia en la MISMA ruta absoluta (/opt/venv) para que los shebang de los
# scripts de consola (uvicorn) y pyvenv.cfg sigan siendo válidos.
COPY --from=builder /opt/venv /opt/venv

# Código de la aplicación.
COPY app ./app

# Usuario no-root.
RUN useradd --create-home --shell /bin/bash appuser
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://localhost:8000/health', timeout=2).status==200 else 1)"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
