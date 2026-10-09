"""Rutas del módulo de control de cajas."""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import CajaViewSet, DenominacionViewSet

router = DefaultRouter()
router.register(r'cajas', CajaViewSet, basename='caja')
router.register(r'denominaciones', DenominacionViewSet, basename='denominacion')

urlpatterns = [
    path('', include(router.urls)),
]
