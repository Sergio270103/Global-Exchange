"""Permisos del módulo de cotizaciones.

Lectura para autenticados; escritura (alta manual de tasas) solo para
admin y analista cambiario (RF41/RF47). El analista no tiene otros
privilegios administrativos (RF49).
"""

from rest_framework.permissions import SAFE_METHODS, BasePermission

from monedas.permisos import es_admin


def es_editor_tasas(usuario) -> bool:
    if usuario is None or not getattr(usuario, 'is_authenticated', False):
        return False
    if getattr(usuario, 'is_superuser', False):
        return True
    if es_admin(usuario):
        return True
    roles = {r.lower() for r in getattr(usuario, 'roles', [])}
    return bool(roles & {'analyst', 'analista', 'analista cambiario'})


class SoloEditorTasasEscribe(BasePermission):
    message = 'Solo un administrador o el analista cambiario puede registrar tasas.'

    def has_permission(self, request, view) -> bool:
        if not getattr(request.user, 'is_authenticated', False):
            return False
        if request.method in SAFE_METHODS:
            return True
        if getattr(view, 'action', None) == 'vigentes':
            return True
        return es_editor_tasas(request.user)
