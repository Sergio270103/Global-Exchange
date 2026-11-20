"""No se exportan solicitudes pendientes ni documentos simulados."""
from django.utils import timezone
from .models import HistorialFactura


def registrar_estado(factura):
    if factura.simulada:
        return
    # Se lee el valor persistido: save(update_fields=...) puede omitir estado.
    factura = type(factura).objects.select_related('operacion__cliente').get(pk=factura.pk)
    estado = {'APROBADA': 'PAGADA', 'RECHAZADA': 'RECHAZADA',
              'ANULADA': 'CANCELADA', 'DEVUELTA': 'ANULADA'}.get(factura.estado)
    if not estado:
        return
    if factura.estado_cancelacion == 'APROBADA':
        estado = 'CANCELADA'
    op = factura.operacion
    cliente = op.cliente
    HistorialFactura.objects.get_or_create(factura=factura, estado=estado, defaults={
        'fecha': timezone.now(),
        'datos': {'operacion': op.pk, 'cliente': cliente.pk,
                  'nombre': f'{cliente.nombre} {cliente.apellido}'.strip(),
                  'documento': cliente.documento, 'email': factura.email_destino,
                  'numero': factura.numero_completo, 'cdc': factura.cdc,
                  'total': str(factura.total), 'emitida_por': factura.emitida_por_nombre},
    })
