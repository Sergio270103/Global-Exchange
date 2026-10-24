"""Rutas de facturación electrónica (PI-30)."""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import FacturaElectronicaViewSet

router = DefaultRouter()
router.register(r'facturas', FacturaElectronicaViewSet, basename='factura')

urlpatterns = [
    path('', include(router.urls)),
]
