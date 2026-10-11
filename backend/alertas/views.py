"""Vistas del módulo de alertas de tasas (PI-38).

- ``GET/POST /api/alertas/`` lista y crea alertas del usuario
  autenticado (el dueño se toma del token, no del cuerpo).
- ``PATCH /api/alertas/<id>/`` edita umbral/dirección (solo si no fue
  ejecutada) o cambia ``estado`` entre activa/pausada.
- ``DELETE /api/alertas/<id>/`` elimina la alerta.
- ``GET /api/alertas/historial/`` disparos del usuario (alertas enviadas).
"""

from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.serializers import ValidationError

from .models import AlertaTasa, DisparoAlerta
from .serializers import AlertaTasaSerializer, DisparoAlertaSerializer


class AlertaTasaViewSet(viewsets.ModelViewSet):
    serializer_class = AlertaTasaSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ['get', 'post', 'patch', 'delete', 'head', 'options']

    def _sub(self) -> str:
        return getattr(self.request.user, 'id', '') or ''

    def get_queryset(self):
        return AlertaTasa.objects.filter(
            usuario_sub=self._sub(),
        ).select_related('moneda')

    def perform_create(self, serializer):
        email = getattr(self.request.user, 'email', '') or ''
        serializer.save(usuario_sub=self._sub(), usuario_email=email)

    def perform_update(self, serializer):
        if serializer.instance.estado == AlertaTasa.ESTADO_EJECUTADA:
            raise ValidationError(
                'La alerta ya fue ejecutada; creá una nueva en su lugar.')
        estado = serializer.validated_data.get('estado')
        if estado and estado not in (
            AlertaTasa.ESTADO_ACTIVA, AlertaTasa.ESTADO_PAUSADA,
        ):
            raise ValidationError(
                'El estado solo puede ser activa o pausada.')
        serializer.save()

    @action(detail=False, methods=['get'], url_path='historial')
    def historial(self, request):
        """Disparos (alertas enviadas) del usuario autenticado."""
        qs = DisparoAlerta.objects.filter(
            alerta__usuario_sub=self._sub(),
        ).select_related('alerta', 'alerta__moneda')
        alerta_id = request.query_params.get('alerta')
        if alerta_id:
            qs = qs.filter(alerta_id=alerta_id)
        return Response(DisparoAlertaSerializer(qs, many=True).data)
