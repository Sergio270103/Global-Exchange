"""Vistas del proyecto core (Global Exchange).

Proporciona endpoints de utilidad del sistema, como el health check
usado por Docker y balanceadores de carga en producción.
"""

from django.http import JsonResponse
from django.views.decorators.http import require_GET


@require_GET
def health_check(request):
    """Endpoint de salud para verificaciones de infraestructura.

    Devuelve 200 con un JSON sencillo si el servidor responde.
    No toca la base de datos ni requiere autenticación.
    """
    return JsonResponse({'status': 'ok'})