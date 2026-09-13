"""Rutas del módulo de pagos."""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import CuentaBancariaViewSet, MetodoPagoViewSet

router = DefaultRouter()
router.register(r'metodos-pago', MetodoPagoViewSet, basename='metodo-pago')
router.register(r'cuentas-bancarias', CuentaBancariaViewSet, basename='cuenta-bancaria')

urlpatterns = [
    path('', include(router.urls)),
]
