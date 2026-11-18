"""Alcance de cuentas bancarias por asociación con el usuario (PI-19)."""

from clientes.models import Cliente


def clientes_asociados(usuario):
    """Usa el sub autenticado de Keycloak, nunca un identificador del payload."""
    sub = getattr(usuario, 'id', None)
    if not sub or not getattr(usuario, 'is_authenticated', False):
        return Cliente.objects.none()
    return Cliente.objects.filter(asociaciones__keycloak_id=sub)
