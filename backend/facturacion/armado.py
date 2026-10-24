"""Armado del JSON resumido de Factura Electrónica (iTiDE=1).

Sigue la "Estructura DE JSON resumido de Factura Electrónica" del manual
de Factura Segura: se envían los datos de cabecera, emisor, receptor,
pagos e ítems; ``calcular_de`` completa los montos e IVA según SIFEN.

Decisiones a confirmar con la profesora (PO) y validar con
``calcular_de`` antes de emitir de verdad:

- Se factura UN ítem: el monto total de la operación en guaraníes
  (ver :func:`monto_total_pyg`), el mismo que muestra la pantalla de
  facturas (PI-28). El tratamiento de IVA sale de
  ``FACTURASEGURA_IVA_TASA`` (10, 5 o 0 = exento).
- Receptor con RUC (documento con guion, ej. ``1234567-8``) → contribuyente;
  sin guion → no contribuyente identificado con cédula paraguaya.
- Medio de pago según ``metodo_pago`` (ver ``TIPO_PAGO``).
"""

from decimal import Decimal, ROUND_HALF_UP

from django.utils import timezone

from operaciones.models import Operacion

from .cliente_fs import config, modo_simulado


class DatosIncompletos(Exception):
    """Falta un dato obligatorio para armar la factura."""


#: Campos del emisor que no pueden quedar vacíos en modo real.
EMISOR_OBLIGATORIOS = (
    'dRucEm', 'dDVEmi', 'iTipCont', 'dNumTim', 'dFeIniT', 'dEst', 'dPunExp',
    'dNomEmi', 'dDirEmi', 'dNumCas', 'cDepEmi', 'dDesDepEmi', 'cCiuEmi',
    'dDesCiuEmi', 'dTelEmi', 'dEmailE', 'cActEco', 'dDesActEco',
)

#: metodo_pago de la operación -> iTiPago del Manual SIFEN.
#: 1=Efectivo, 5=Transferencia, 7=Billetera electrónica, 21=Pago electrónico.
#: Verificar con calcular_de: la tarjeta (3/4) exige datos de la tarjeta
#: que la operación no guarda, por eso se informa como pago electrónico.
TIPO_PAGO = {
    'efectivo': '1',
    'cash': '1',
    'transfer': '5',
    'transferencia': '5',
    'wallet': '7',
    'billetera': '7',
    'card': '21',
    'tarjeta': '21',
    'qr': '21',
}


def datos_emisor() -> dict:
    """Datos del emisor desde settings; valida que estén completos."""
    emisor = dict(config()['EMISOR'])
    faltan = [k for k in EMISOR_OBLIGATORIOS if not str(emisor.get(k, '')).strip()]
    if faltan:
        if not modo_simulado():
            raise DatosIncompletos(
                'Faltan datos del emisor en el .env: ' + ', '.join(faltan))
        for k in faltan:
            emisor[k] = '0' if k in ('dRucEm', 'dDVEmi', 'iTipCont') else 'SIMULADO'
    return emisor


def monto_total_pyg(op: Operacion) -> Decimal:
    """Monto total de la operación en guaraníes (entero).

    - Origen PYG (el cliente compra divisa): lo que paga, ``monto_enviado``,
      que ya incluye la comisión.
    - Destino PYG (el cliente vende divisa): lo que recibe,
      ``monto_recibido``.
    - Divisa a divisa: ``monto_enviado`` pasado a PYG con ``tasa_origen``.
    """
    origen = op.moneda_origen.codigo.strip().upper()
    destino = op.moneda_destino.codigo.strip().upper()
    if origen == 'PYG':
        monto = Decimal(op.monto_enviado)
    elif destino == 'PYG':
        monto = Decimal(op.monto_recibido)
    else:
        monto = Decimal(op.monto_enviado) * Decimal(op.tasa_origen or 0)
    return monto.quantize(Decimal('1'), rounding=ROUND_HALF_UP)


def datos_receptor(op: Operacion, email: str) -> dict:
    cliente = op.cliente
    documento = (cliente.documento or '').strip().replace('.', '')
    nombre = (cliente.nombre_completo or str(cliente))[:255]
    if '-' in documento:
        ruc, dv = documento.rsplit('-', 1)
        if not (ruc.isdigit() and dv.isdigit()):
            raise DatosIncompletos(f'El RUC del cliente "{documento}" no es válido.')
        return {
            'iNatRec': '1',  # contribuyente
            'iTiOpe': '1',  # B2B
            'cPaisRec': 'PRY',
            'iTiContRec': '2' if cliente.tipo == cliente.TIPO_JURIDICA else '1',
            'dRucRec': ruc,
            'dDVRec': dv,
            'iTipIDRec': '0',
            'dNumIDRec': '0',
            'dNomRec': nombre,
            'dEmailRec': email,
        }
    if not documento.isdigit():
        raise DatosIncompletos(
            f'El documento del cliente "{documento}" no es una cédula ni un RUC.')
    return {
        'iNatRec': '2',  # no contribuyente
        'iTiOpe': '2',  # B2C
        'cPaisRec': 'PRY',
        'iTiContRec': '0',
        'dRucRec': '0',
        'dDVRec': '0',
        'iTipIDRec': '1',  # cédula paraguaya
        'dNumIDRec': documento,
        'dNomRec': nombre,
        'dEmailRec': email,
    }


def armar_de_resumido(op: Operacion, numero: str, email: str) -> dict:
    """JSON resumido de la factura de una operación PAGADA."""
    total = monto_total_pyg(op)
    if total <= 0:
        raise DatosIncompletos(
            'El monto de la operación en guaraníes es 0: no hay monto para facturar.')
    emisor = datos_emisor()
    iva = int(config().get('IVA_TASA', 10))
    if iva not in (0, 5, 10):
        raise DatosIncompletos('FACTURASEGURA_IVA_TASA debe ser 10, 5 o 0.')
    metodo = (op.metodo_pago or 'efectivo').strip().lower()
    total_txt = str(total)
    tipo = 'compra' if op.tipo_operacion == Operacion.TIPO_COMPRA else 'venta'
    divisa = (
        op.moneda_destino.codigo if op.tipo_operacion == Operacion.TIPO_COMPRA
        else op.moneda_origen.codigo)

    return {
        'iTipEmi': '1',
        'iTiDE': '1',
        'dNumTim': emisor['dNumTim'],
        'dFeIniT': emisor['dFeIniT'],
        'dEst': emisor['dEst'],
        'dPunExp': emisor['dPunExp'],
        'dNumDoc': numero,
        'dFeEmiDE': timezone.localtime().strftime('%Y-%m-%dT%H:%M:%S'),
        'iTipTra': '2',  # prestación de servicios
        'iTImp': '1',  # IVA
        'cMoneOpe': 'PYG',
        'dCondTiCam': '1',
        'dTiCam': '1',
        'dRucEm': emisor['dRucEm'],
        'dDVEmi': emisor['dDVEmi'],
        'iTipCont': emisor['iTipCont'],
        'dNomEmi': emisor['dNomEmi'],
        'dDirEmi': emisor['dDirEmi'],
        'dNumCas': emisor['dNumCas'],
        'cDepEmi': emisor['cDepEmi'],
        'dDesDepEmi': emisor['dDesDepEmi'],
        'cCiuEmi': emisor['cCiuEmi'],
        'dDesCiuEmi': emisor['dDesCiuEmi'],
        'dTelEmi': emisor['dTelEmi'],
        'dEmailE': emisor['dEmailE'],
        'gActEco': [{
            'cActEco': emisor['cActEco'],
            'dDesActEco': emisor['dDesActEco'],
        }],
        **datos_receptor(op, email),
        'iIndPres': '1' if metodo in ('efectivo', 'cash') else '2',
        'iCondOpe': '1',  # contado
        'gPaConEIni': [{
            'iTiPago': TIPO_PAGO.get(metodo, '1'),
            'dMonTiPag': total_txt,
            'cMoneTiPag': 'PYG',
            'dTiCamTiPag': '1',
        }],
        'iCondCred': '1',
        'dPlazoCre': '0',
        'gCamItem': [{
            'dCodInt': f'OP-{op.pk}',
            'dDesProSer': f'Operación de {tipo} de {divisa} - OP-{op.pk}',
            'cUniMed': '77',
            'dCantProSer': '1',
            'dPUniProSer': total_txt,
            'dDescItem': '0',
            'dDescGloItem': '0',
            'dAntPreUniIt': '0',
            'dAntGloPreUniIt': '0',
            'iAfecIVA': '1' if iva else '3',
            'dPropIVA': '100' if iva else '0',
            'dTasaIVA': str(iva),
        }],
        'CDC': '0',
        'dCodSeg': '0',
        'dDVId': '0',
        'dSisFact': '1',
        'dInfAdic': f'Operación OP-{op.pk}',
    }
