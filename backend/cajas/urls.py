"""Rutas del módulo de control de cajas."""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import CajaViewSet, DenominacionViewSet, EntregaViewSet, SolicitudViewSet

router = DefaultRouter()
router.register(r'cajas', CajaViewSet, basename='caja')
router.register(r'denominaciones', DenominacionViewSet, basename='denominacion')
router.register(r'entregas', EntregaViewSet, basename='entrega')
router.register(r'solicitudes', SolicitudViewSet, basename='solicitud')

urlpatterns = [
    path('', include(router.urls)),
]
