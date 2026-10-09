"""Permisos del módulo de control de cajas.

Solo el personal de caja (cajero) y el administrador acceden a las
cajas. Dar de alta o modificar cajas y denominaciones es tarea del
administrador. Registrar una ENTREGA de billetes también (PI-43); el
cajero registra ingresos, retiros y arqueos.
"""

from rest_framework.permissions import SAFE_METHODS, BasePermission

from monedas.permisos import es_admin

#: Roles del realm que identifican al cajero.
ROLES_CAJERO = ('cashier', 'cajero')


def es_cajero(usuario) -> bool:
    if usuario is None or not getattr(usuario, 'is_authenticated', False):
        return False
    roles = {r.lower() for r in getattr(usuario, 'roles', [])}
    return bool(roles & set(ROLES_CAJERO))


def es_personal_caja(usuario) -> bool:
    return es_admin(usuario) or es_cajero(usuario)


class PersonalCaja(BasePermission):
    """Cajero o administrador. La escritura del catálogo, solo admin."""

    message = 'Solo el cajero o un administrador pueden acceder a las cajas.'

    #: Acciones que el cajero puede usar aunque escriban (POST).
    ACCIONES_CAJERO = ('saldo', 'movimientos', 'arqueos')

    def has_permission(self, request, view) -> bool:
        usuario = request.user
        if not es_personal_caja(usuario):
            return False
        if request.method in SAFE_METHODS:
            return True
        if getattr(view, 'action', None) in self.ACCIONES_CAJERO:
            return True
        return es_admin(usuario)
