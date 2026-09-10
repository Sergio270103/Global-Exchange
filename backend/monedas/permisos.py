"""
Permisos del módulo de monedas.

La lectura del catálogo está disponible para cualquier usuario
autenticado; la creación, edición y baja quedan restringidas al rol
``admin`` del realm de Keycloak.
"""

from rest_framework.permissions import SAFE_METHODS, BasePermission

#: Roles del realm que habilitan la administración de monedas.
ROLES_ADMIN = ('admin', 'administrador')


def es_admin(usuario) -> bool:
    """Indica si el usuario tiene rol de administrador.

    Funciona tanto con :class:`~monedas.autenticacion.UsuarioKeycloak`
    como con un ``User`` de Django que tenga ``is_superuser``.
    """
    if usuario is None or not getattr(usuario, 'is_authenticated', False):
        return False
    if getattr(usuario, 'is_superuser', False):
        return True
    roles = {r.lower() for r in getattr(usuario, 'roles', [])}
    return bool(roles & set(ROLES_ADMIN))


class SoloAdminEscribe(BasePermission):
    """Lectura para autenticados, escritura solo para administradores."""

    message = 'Solo un administrador puede modificar las monedas.'

    def has_permission(self, request, view) -> bool:
        if not getattr(request.user, 'is_authenticated', False):
            return False
        if request.method in SAFE_METHODS:
            return True
        return es_admin(request.user)