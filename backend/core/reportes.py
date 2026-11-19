"""Datos de exportación administrativa; sin paginación ni mutaciones externas."""
from collections import Counter
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from clientes.models import Cliente, ClienteUsuario
from clientes.permisos import SoloAdmin
from operaciones.models import Operacion
from operaciones.serializers import OperacionSerializer
from operaciones.ganancias import calcular_ganancias, _fecha
from facturacion.models import HistorialFactura

COLUMNAS_OP = ['ID', 'Fecha', 'Cliente', 'Realizada por', 'Tipo', 'Estado',
    'Moneda origen', 'Monto enviado', 'Moneda destino', 'Monto recibido', 'Tasa',
    'Método de pago', 'Fecha de pago', 'Fecha de cancelación', 'Cancelada por', 'Motivo de cancelación']


def fecha(valor):
    return timezone.localtime(valor).strftime('%d/%m/%Y %H:%M:%S') if valor else ''


def rango(qs, campo, params):
    desde, hasta = _fecha(params, 'desde'), _fecha(params, 'hasta')
    if desde and hasta and desde > hasta:
        raise ValidationError('La fecha inicial debe ser anterior o igual a la final.')
    if desde:
        qs = qs.filter(**{campo + '__date__gte': desde})
    if hasta:
        qs = qs.filter(**{campo + '__date__lte': hasta})
    return qs


def operaciones(params, cliente=None):
    qs = Operacion.objects.select_related('cliente', 'moneda_origen', 'moneda_destino').order_by('fecha_creacion', 'pk')
    qs = rango(qs, 'fecha_creacion', params)
    if cliente:
        qs = qs.filter(cliente=cliente)
    estado = params.get('estado')
    if estado:
        if estado not in dict(Operacion.ESTADOS):
            raise ValidationError('Estado de operación inválido.')
        qs = qs.filter(estado=estado)
    moneda = params.get('moneda')
    if moneda:
        qs = qs.filter(Q(moneda_origen__codigo=moneda) | Q(moneda_destino__codigo=moneda))
    return list(qs)


def filas_operaciones(ops):
    nombres = {(a.cliente_id, a.keycloak_id): a.username for a in ClienteUsuario.objects.filter(
        cliente_id__in={op.cliente_id for op in ops})}
    serializer = OperacionSerializer()
    for op in ops:
        op.usuario_nombre_anotado = nombres.get((op.cliente_id, op.usuario_keycloak_id), op.usuario_keycloak_id)
        op.cancelada_por_nombre_anotado = nombres.get((op.cliente_id, op.cancelada_por), op.cancelada_por_nombre or op.cancelada_por)
    return [[op.pk, fecha(op.fecha_creacion), op.cliente.nombre_completo,
             serializer.get_usuario_nombre(op), op.get_tipo_operacion_display(), op.get_estado_display(),
             op.moneda_origen.codigo, op.monto_enviado, op.moneda_destino.codigo, op.monto_recibido,
             op.cotizacion_aplicada, op.metodo_pago, fecha(op.fecha_confirmacion),
             fecha(op.fecha_cancelacion), serializer.get_cancelada_por_nombre(op),
             op.get_motivo_cancelacion_display()] for op in ops]


@api_view(['GET'])
@permission_classes([SoloAdmin])
def reporte(request, tipo):
    params = request.query_params
    notas = ['Fechas y horas de Paraguay.']
    if tipo in ('transacciones', 'clientes'):
        cliente = None
        if tipo == 'clientes':
            try:
                cliente_id = int(params.get('cliente', ''))
            except ValueError:
                raise ValidationError('Seleccioná un cliente.')
            cliente = get_object_or_404(Cliente, pk=cliente_id)
        ops = operaciones(params, cliente)
        columnas, filas = COLUMNAS_OP, filas_operaciones(ops)
        if cliente:
            notas += [f'Cliente: {cliente.nombre_completo} | Documento/RUC: {cliente.documento}',
                      f'Correo: {cliente.email} | Categoría: {cliente.get_categoria_display()}',
                      f'Operaciones en el período: {len(ops)}',
                      ' | '.join(f'{estado}: {cantidad}' for estado, cantidad in Counter(op.get_estado_display() for op in ops).items())]
    elif tipo == 'ganancias':
        datos = calcular_ganancias({**params.dict(), 'agrupar': 'moneda'})
        columnas = ['Moneda', 'Comisiones cobradas', 'Comisiones revertidas', 'Ganancia neta']
        filas = [[f['moneda'], f['comisiones_cobradas'], f['comisiones_revertidas'], f['comision']] for f in datos['por_moneda']]
        notas += ['Importes expresados en cada moneda. Cobros por fecha de pago y débitos por fecha de cancelación.']
    elif tipo == 'facturas':
        qs = HistorialFactura.objects.order_by('fecha', 'pk')
        qs = rango(qs, 'fecha', params)
        estado = params.get('estado')
        if estado:
            if estado not in ('PAGADA', 'CANCELADA', 'ANULADA', 'RECHAZADA'):
                raise ValidationError('Estado de factura inválido.')
            qs = qs.filter(estado=estado)
        columnas = ['Factura ID', 'Operación', 'Cliente', 'Documento/RUC', 'Correo', 'Número', 'CDC', 'Estado', 'Fecha del estado', 'Total PYG', 'Emitida por']
        filas = [[h.factura_id, h.datos.get('operacion'), h.datos.get('nombre'), h.datos.get('documento'),
                  h.datos.get('email'), h.datos.get('numero'), h.datos.get('cdc'), h.estado,
                  fecha(h.fecha) or 'Fecha de transición no disponible', h.datos.get('total'), h.datos.get('emitida_por')] for h in qs]
        notas += ['Solo resultados fiscales confirmados de facturas reales. Una fila por estado confirmado.',
                  'Los registros históricos sin fecha de transición se incluyen solo al consultar todo el historial.']
    elif tipo == 'accesos':
        from .reportes_keycloak import usuarios_habilitados
        columnas = ['Nombre', 'Usuario', 'Correo', 'Roles']
        filas = usuarios_habilitados(request)
        notas += ['Usuarios habilitados con roles de Global Exchange; consulta actual de Keycloak.']
    else:
        raise ValidationError('Tipo de reporte inválido.')
    notas += [f"Desde: {params.get('desde') or 'inicio'} | Hasta: {params.get('hasta') or 'actualidad'} | Estado: {params.get('estado') or 'Todos'}"] if tipo != 'accesos' else []
    return Response({'columnas': columnas, 'filas': filas, 'notas': notas})
