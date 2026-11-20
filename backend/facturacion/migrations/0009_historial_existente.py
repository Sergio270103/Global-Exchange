from django.db import migrations


def copiar_confirmados(apps, schema_editor):
    Factura = apps.get_model('facturacion', 'FacturaElectronica')
    Historial = apps.get_model('facturacion', 'HistorialFactura')
    alias = schema_editor.connection.alias
    for f in Factura.objects.using(alias).filter(simulada=False).select_related('operacion__cliente').iterator():
        estado = {'APROBADA': 'PAGADA', 'RECHAZADA': 'RECHAZADA', 'ANULADA': 'CANCELADA', 'DEVUELTA': 'ANULADA'}.get(f.estado)
        if f.estado_cancelacion == 'APROBADA':
            estado = 'CANCELADA'
        cliente = f.operacion.cliente
        datos = {'operacion': f.operacion_id, 'cliente': cliente.pk,
                 'nombre': f'{cliente.nombre} {cliente.apellido}'.strip(),
                 'documento': cliente.documento, 'email': f.email_destino,
                 'numero': f.numero_completo, 'cdc': f.cdc,
                 'total': str(f.total), 'emitida_por': f.emitida_por_nombre}
        # La fecha de última consulta no prueba cuándo ocurrió la transición.
        estados = [estado] if estado else []
        if estado in ('CANCELADA', 'ANULADA'):
            estados.insert(0, 'PAGADA')
        for valor in estados:
            Historial.objects.using(alias).get_or_create(factura_id=f.pk, estado=valor,
                defaults={'fecha': None, 'datos': datos})


class Migration(migrations.Migration):
    dependencies = [('facturacion', '0008_historialfactura')]
    operations = [migrations.RunPython(copiar_confirmados, migrations.RunPython.noop)]
