"""Rutas del módulo de clientes."""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import ClienteUsuarioViewSet, ClienteViewSet, AjustePrecioViewSet

router = DefaultRouter()
router.register(r'clientes', ClienteViewSet, basename='cliente')
router.register(r'asociaciones', ClienteUsuarioViewSet, basename='asociacion')
router.register(r'ajustes-precios', AjustePrecioViewSet, basename='ajuste_precio')
# Ruta legacy para no romper clientes existentes; también queda restringida al admin.
router.register(r'comisiones', AjustePrecioViewSet, basename='comision_legacy')

urlpatterns = [
    path('', include(router.urls)),
]
