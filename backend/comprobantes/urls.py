"""Rutas del módulo de comprobantes internos."""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import ComprobanteViewSet

router = DefaultRouter()
router.register(r'comprobantes', ComprobanteViewSet, basename='comprobante')

urlpatterns = [
    path('', include(router.urls)),
]
