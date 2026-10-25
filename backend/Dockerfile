# Dockerfile del backend Django (Global Exchange - PI-88)
# Imagen ligera basada en Python slim, lista para producción con gunicorn.

FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DJANGO_SETTINGS_MODULE=core.settings

WORKDIR /app

# Dependencias del sistema (psycopg2 necesita libpq)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    && rm -rf /var/lib/apt/lists/*

# Copiar e instalar dependencias de Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copiar código de la aplicación
COPY . .

# Recopilar archivos estáticos (necesario para whitenoise en producción)
RUN python manage.py collectstatic --noinput 2>/dev/null || true

# Puerto de la aplicación
EXPOSE 8000

# Comando de inicio con gunicorn
CMD ["gunicorn", "--bind", "0.0.0.0:8000", "--workers", "3", "--timeout", "60", "core.wsgi:application"]