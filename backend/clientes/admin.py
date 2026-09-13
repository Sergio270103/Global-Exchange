"""Registro de clientes en el admin de Django."""

from django.contrib import admin

from .models import Cliente, ClienteUsuario, Comision


@admin.register(Cliente)
class ClienteAdmin(admin.ModelAdmin):
    list_display = ('nombre', 'documento', 'tipo', 'categoria', 'activo')
    list_filter = ('tipo', 'categoria', 'activo')
    search_fields = ('nombre', 'documento', 'email')


@admin.register(ClienteUsuario)
class ClienteUsuarioAdmin(admin.ModelAdmin):
    list_display = ('username', 'cliente', 'keycloak_id')
    search_fields = ('username', 'email', 'keycloak_id', 'cliente__nombre')


@admin.register(Comision)
class ComisionAdmin(admin.ModelAdmin):
    list_display = ('categoria', 'porcentaje', 'actualizado_en')
