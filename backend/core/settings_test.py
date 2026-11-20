"""Pruebas unitarias locales sin PostgreSQL ni servicios externos.

Uso: python manage.py test --settings=core.settings_test
Las pruebas de concurrencia de select_for_update requieren PostgreSQL.
"""
from .settings import *  # noqa: F403

DATABASES = {'default': {'ENGINE': 'django.db.backends.sqlite3', 'NAME': ':memory:'}}
PASSWORD_HASHERS = ['django.contrib.auth.hashers.MD5PasswordHasher']
