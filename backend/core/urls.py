"""
URL configuration for core project.

Sin Django Admin (pedido de la cátedra): todo se gestiona desde el frontend.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.1/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.urls import include, path

from . import views

urlpatterns = [
    path('api/health/', views.health_check, name='health-check'),
    path('api/', include('monedas.urls')),
    path('api/', include('clientes.urls')),
    path('api/', include('cotizaciones.urls')),
    path('api/', include('pagos.urls')),
    path('api/', include('billeteras.urls')),
    path('api/', include('operaciones.urls')),
    path('api/', include('cajas.urls')),
    path('api/', include('alertas.urls')),
    path('api/', include('comprobantes.urls')),
    path('api/', include('facturacion.urls')),
]
