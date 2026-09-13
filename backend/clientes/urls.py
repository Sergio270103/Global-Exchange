"""Rutas del módulo de clientes."""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import ClienteUsuarioViewSet, ClienteViewSet, ComisionViewSet

router = DefaultRouter()
router.register(r'clientes', ClienteViewSet, basename='cliente')
router.register(r'asociaciones', ClienteUsuarioViewSet, basename='asociacion')
router.register(r'comisiones', ComisionViewSet, basename='comision')

urlpatterns = [
    path('', include(router.urls)),
]
