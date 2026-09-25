"""Vistas del módulo de operaciones (Hito Operaciones).

- ``GET /api/operaciones/`` historial con filtros ``?cliente=`` ``?mine=1``
  ``?tipo=COMPRA|VENTA`` (para Transactions.tsx).
- ``POST /api/operaciones/`` ejecuta compra/venta con validaciones:
  cliente activo + asociación Keycloak, monedas activas, última cotización
  vigente y comisión por categoría.
"""

from decimal import Decimal, ROUND_HALF_UP

from django.db.models import Q
from rest_framework import status, viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from clientes.models import Cliente, ClienteUsuario, Comision
from cotizaciones.models import Cotizacion
from monedas.models import Moneda

from .models import Operacion
from .serializers import CrearOperacionSerializer, OperacionSerializer

ERROR_CLIENTE = (
    'La operación no puede ser realizada: el cliente está inactivo '
    'o el usuario no está asociado a este cliente.'
)


def _redondear(valor: Decimal, codigo: str) -> Decimal:
    """Redondeo: 0 decimales para PYG, 2 para el resto."""
    if codigo.strip().upper() == 'PYG':
        return valor.quantize(Decimal('1'), rounding=ROUND_HALF_UP)
    return valor.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


def _ultima_tasa(moneda: Moneda, lado: str) -> Decimal | None:
    """Última cotización vigente: lado compra o venta."""
    cot = Cotizacion.objects.filter(moneda=moneda).order_by('-vigente_desde').first()
    if not cot:
        return None
    return Decimal(str(cot.compra if lado == 'compra' else cot.venta))


class OperacionViewSet(viewsets.ModelViewSet):
    queryset = Operacion.objects.select_related(
        'cliente', 'moneda_origen', 'moneda_destino',
    ).all()
    serializer_class = OperacionSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ['get', 'post', 'head', 'options']

    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.query_params.get('mine') in ('1', 'true', 'si', 'sí'):
            sub = getattr(self.request.user, 'id', '') or ''
            clientes_ids = ClienteUsuario.objects.filter(
                keycloak_id=sub,
            ).values_list('cliente_id', flat=True)
            qs = qs.filter(cliente_id__in=clientes_ids)
        else:
            cliente = self.request.query_params.get('cliente')
            if cliente:
                qs = qs.filter(cliente_id=cliente)
        tipo = self.request.query_params.get('tipo')
        if tipo:
            qs = qs.filter(tipo_operacion=tipo.strip().upper())
        buscar = self.request.query_params.get('buscar')
        if buscar:
            qs = qs.filter(
                Q(moneda_origen__codigo__icontains=buscar)
                | Q(moneda_destino__codigo__icontains=buscar)
                | Q(cliente__nombre__icontains=buscar)
            )
        return qs

    def create(self, request, *args, **kwargs):
        entrada = CrearOperacionSerializer(data=request.data)
        if not entrada.is_valid():
            return Response(entrada.errors, status=status.HTTP_400_BAD_REQUEST)

        datos = entrada.validated_data
        tipo = str(datos['tipo_operacion']).upper()
        codigo_div = str(datos['moneda']).strip().upper()
        codigo_contra = str(datos.get('moneda_contraparte') or 'PYG').strip().upper()
        monto_div = Decimal(str(datos['monto_divisa']))
        metodo_pago = str(datos.get('metodo_pago') or '').strip().lower()[:24]

        if monto_div <= 0:
            return Response(
                {'detail': 'Indicá un monto mayor a cero.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if codigo_div == codigo_contra:
            return Response(
                {'detail': 'La moneda origen y destino deben ser distintas.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 1) Cliente + asociación Keycloak.
        sub = getattr(request.user, 'id', '') or ''
        try:
            cliente = Cliente.objects.get(id=datos['cliente'])
        except Cliente.DoesNotExist:
            return Response({'detail': ERROR_CLIENTE}, status=status.HTTP_400_BAD_REQUEST)
        asociado = ClienteUsuario.objects.filter(cliente=cliente, keycloak_id=sub).exists()
        if not cliente.activo or not asociado:
            return Response({'detail': ERROR_CLIENTE}, status=status.HTTP_400_BAD_REQUEST)

        # 2) Monedas activas.
        try:
            divisa = Moneda.objects.get(codigo=codigo_div, activo=True)
        except Moneda.DoesNotExist:
            return Response(
                {'detail': f'La moneda {codigo_div} no está admitida.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            contra = Moneda.objects.get(codigo=codigo_contra, activo=True)
        except Moneda.DoesNotExist:
            return Response(
                {'detail': f'La moneda {codigo_contra} no está admitida.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 3) Tasas vigentes (1 para PYG).
        tasa_compra_div = _ultima_tasa(divisa, 'compra') if codigo_div != 'PYG' else Decimal('1')
        tasa_venta_div = _ultima_tasa(divisa, 'venta') if codigo_div != 'PYG' else Decimal('1')
        tasa_compra_contra = (
            _ultima_tasa(contra, 'compra') if codigo_contra != 'PYG' else Decimal('1')
        )
        tasa_venta_contra = (
            _ultima_tasa(contra, 'venta') if codigo_contra != 'PYG' else Decimal('1')
        )
        if (
            tasa_compra_div is None or tasa_venta_div is None
            or tasa_compra_contra is None or tasa_venta_contra is None
        ):
            faltante = codigo_div if tasa_compra_div is None or tasa_venta_div is None else codigo_contra
            return Response(
                {'detail': f'Todavía no hay cotización para {faltante}.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 4) Comisión por categoría (la define el backend, no el front).
        try:
            pct = Decimal(str(Comision.objects.get(categoria=cliente.categoria).porcentaje))
        except Comision.DoesNotExist:
            pct = Decimal('0')

        # 5) Cálculo. Comisión siempre guardada en moneda destino.
        if tipo == 'COMPRA':
            # El cliente compra `monto_div` de divisa y paga en contraparte.
            moneda_origen, moneda_destino = contra, divisa
            # PYG necesarios brutos para esa divisa (vía pivote si es cruce).
            if codigo_contra == 'PYG':
                bruto_origen = monto_div * tasa_venta_div
            else:
                pyg_necesarios = monto_div * tasa_venta_div
                bruto_origen = pyg_necesarios / tasa_compra_contra
            comision_origen = bruto_origen * pct / Decimal('100')
            monto_enviado = _redondear(bruto_origen + comision_origen, moneda_origen.codigo)
            monto_recibido = _redondear(monto_div, moneda_destino.codigo)
            # Comisión expresada en destino para el comprobante.
            if codigo_contra == 'PYG':
                comision_dest = comision_origen / tasa_venta_div if tasa_venta_div else Decimal('0')
            else:
                comision_pyg = comision_origen * tasa_compra_contra
                comision_dest = comision_pyg / tasa_venta_div if tasa_venta_div else Decimal('0')
            monto_comision = _redondear(comision_dest, moneda_destino.codigo)
            tasa_origen = tasa_compra_contra if codigo_contra != 'PYG' else None
            tasa_destino = tasa_venta_div if codigo_div != 'PYG' else None
            efectiva = (bruto_origen / monto_div) if monto_div else Decimal('0')
        else:
            # VENTA: el cliente entrega `monto_div` y recibe en contraparte.
            moneda_origen, moneda_destino = divisa, contra
            if codigo_contra == 'PYG':
                bruto_dest = monto_div * tasa_compra_div
            else:
                pyg = monto_div * tasa_compra_div
                bruto_dest = pyg / tasa_venta_contra
            comision_dest = bruto_dest * pct / Decimal('100')
            neto_dest = bruto_dest - comision_dest
            if neto_dest <= 0:
                return Response(
                    {'detail': 'El monto neto debe ser mayor a cero.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            monto_enviado = _redondear(monto_div, moneda_origen.codigo)
            monto_recibido = _redondear(neto_dest, moneda_destino.codigo)
            monto_comision = _redondear(comision_dest, moneda_destino.codigo)
            tasa_origen = tasa_compra_div if codigo_div != 'PYG' else None
            tasa_destino = tasa_venta_contra if codigo_contra != 'PYG' else None
            efectiva = (bruto_dest / monto_div) if monto_div else Decimal('0')

        op = Operacion.objects.create(
            cliente=cliente,
            usuario_keycloak_id=sub[:64],
            tipo_operacion=tipo,
            moneda_origen=moneda_origen,
            moneda_destino=moneda_destino,
            monto_enviado=monto_enviado,
            monto_recibido=monto_recibido,
            cotizacion_aplicada=efectiva.quantize(
                Decimal('0.000001'),
            ) if efectiva else Decimal('0'),
            tasa_origen=tasa_origen,
            tasa_destino=tasa_destino,
            porcentaje_comision_aplicado=pct,
            monto_comision=monto_comision,
            metodo_pago=metodo_pago,
        )
        return Response(
            OperacionSerializer(op).data, status=status.HTTP_201_CREATED,
        )
