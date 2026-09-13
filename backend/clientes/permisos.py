"""Permisos del módulo de clientes.

Lectura para autenticados; escritura de clientes y comisiones solo para
admin. Las asociaciones usuario-cliente las gestiona el admin.
"""

from rest_framework.permissions import SAFE_METHODS, BasePermission

from monedas.permisos import es_admin


class SoloAdminEscribe(BasePermission):
    message = 'Solo un administrador puede modificar este recurso.'

    def has_permission(self, request, view) -> bool:
        if not getattr(request.user, 'is_authenticated', False):
            return False
        if request.method in SAFE_METHODS:
            return True
        return es_admin(request.user)
