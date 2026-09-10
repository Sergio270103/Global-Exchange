"""Rutas del módulo de monedas."""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import MonedaViewSet

router = DefaultRouter()
router.register(r'monedas', MonedaViewSet, basename='moneda')

urlpatterns = [
    path('', include(router.urls)),
]