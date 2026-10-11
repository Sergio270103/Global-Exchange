"""Rutas del módulo de alertas de tasas."""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import AlertaTasaViewSet

router = DefaultRouter()
router.register(r'alertas', AlertaTasaViewSet, basename='alerta')

urlpatterns = [
    path('', include(router.urls)),
]
