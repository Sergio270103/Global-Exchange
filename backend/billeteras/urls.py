"""Rutas del módulo de billeteras."""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import BilleteraViewSet, MedioAcreditacionViewSet

router = DefaultRouter()
router.register(r'billeteras', BilleteraViewSet, basename='billetera')
router.register(r'medios-acreditacion', MedioAcreditacionViewSet, basename='medio-acreditacion')

urlpatterns = [
    path('', include(router.urls)),
]
