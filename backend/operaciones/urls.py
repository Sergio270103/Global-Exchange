"""Rutas del módulo de operaciones."""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import OperacionViewSet

router = DefaultRouter()
router.register(r'operaciones', OperacionViewSet, basename='operacion')

urlpatterns = [
    path('', include(router.urls)),
]
