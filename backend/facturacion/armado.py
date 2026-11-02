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

import re
from decimal import Decimal, ROUND_HALF_UP

from django.utils import timezone

from operaciones.models import Operacion

from .cliente_fs import config, modo_simulado
from .models import MOTIVOS_NC


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


def actividades_economicas(emisor: dict) -> list[dict]:
    """``gActEco`` a partir de códigos y descripciones separados con ``|``."""
    codigos = [c.strip() for c in str(emisor.get('cActEco', '')).split('|')]
    descripciones = [d.strip() for d in str(emisor.get('dDesActEco', '')).split('|')]
    if len(codigos) != len(descripciones):
        raise DatosIncompletos(
            'FACTURASEGURA_ACT_ECO_COD y FACTURASEGURA_ACT_ECO deben tener la '
            'misma cantidad de actividades (separadas con "|").')
    return [{'cActEco': c, 'dDesActEco': d} for c, d in zip(codigos, descripciones)]


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
    original = (cliente.documento or '').strip()
    # Se aceptan puntos, espacios y guiones dentro del número
    # (23.456.789-0, 80-012345-6): el último guion separa el DV.
    documento = re.sub(r'[\s.]', '', original)
    nombre = (cliente.nombre_completo or str(cliente))[:255]
    if '-' in documento:
        ruc, dv = documento.rsplit('-', 1)
        ruc = ruc.replace('-', '')
        if not (ruc.isdigit() and dv.isdigit() and len(dv) == 1):
            raise DatosIncompletos(f'El RUC del cliente "{original}" no es válido.')
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
            f'El documento del cliente "{original}" no es una cédula ni un RUC.')
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
        # El distrito es opcional: se envía solo si está configurado.
        **({'cDisEmi': emisor['cDisEmi'], 'dDesDisEmi': emisor['dDesDisEmi']}
           if str(emisor.get('cDisEmi', '')).strip() else {}),
        'cCiuEmi': emisor['cCiuEmi'],
        'dDesCiuEmi': emisor['dDesCiuEmi'],
        'dTelEmi': emisor['dTelEmi'],
        'dEmailE': emisor['dEmailE'],
        'gActEco': actividades_economicas(emisor),
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


#: Campos del ítem que forman parte del JSON resumido de una NC.
CAMPOS_ITEM_NC = (
    'dCodInt', 'dDesProSer', 'cUniMed', 'dCantProSer', 'dPUniProSer',
    'dDescItem', 'dDescGloItem', 'dAntPreUniIt', 'dAntGloPreUniIt',
    'iAfecIVA', 'dPropIVA', 'dTasaIVA',
)


def _item_nc(item: dict, total: str, posicion: int) -> dict:
    """Copia solo los campos del resumido, sin los montos calculados."""
    limpio = {campo: item.get(campo) for campo in CAMPOS_ITEM_NC}
    limpio['dCodInt'] = str(limpio.get('dCodInt') or f'NC-{posicion}')
    limpio['dDesProSer'] = str(
        limpio.get('dDesProSer') or 'Nota de crédito')
    limpio['cUniMed'] = str(limpio.get('cUniMed') or '77')
    limpio['dCantProSer'] = str(limpio.get('dCantProSer') or '1')
    limpio['dPUniProSer'] = str(limpio.get('dPUniProSer') or total)
    for campo in ('dDescItem', 'dDescGloItem', 'dAntPreUniIt', 'dAntGloPreUniIt'):
        limpio[campo] = str(limpio.get(campo) or '0')
    limpio['iAfecIVA'] = str(limpio.get('iAfecIVA') or '1')
    limpio['dPropIVA'] = str(limpio.get('dPropIVA') or '100')
    limpio['dTasaIVA'] = str(limpio.get('dTasaIVA') or '10')
    return limpio


def armar_nc_resumido(
    factura, numero: str, email: str, motivo: str,
) -> dict:
    """JSON resumido de una nota de crédito total (iTiDE=5).

    Replica el emisor, el receptor, el tipo de transacción y los ítems de la
    factura original, y referencia su CDC en ``gCamDEAsoc``. Factura Segura
    solo admite un documento asociado y una NC total en este MVP.
    """
    if motivo not in dict(MOTIVOS_NC):
        raise DatosIncompletos(
            f'El motivo de la nota de crédito "{motivo}" no es válido.')
    original = dict(factura.de_enviado or {})
    op = factura.operacion
    if not original:
        # Respaldo para datos históricos sin DE guardado: se arma igual que
        # una factura y se transforma en NC.
        original = armar_de_resumido(op, numero, email)

    emisor = datos_emisor()
    total = str(factura.total)
    receptor = datos_receptor(op, email)
    for campo in (
        'iNatRec', 'iTiOpe', 'cPaisRec', 'iTiContRec', 'dRucRec', 'dDVRec',
        'iTipIDRec', 'dNumIDRec', 'dNomRec',
    ):
        if str(original.get(campo, '')).strip():
            receptor[campo] = original[campo]
    receptor['dEmailRec'] = email

    items = original.get('gCamItem') or []
    if not items:
        items = [{
            'dCodInt': f'OP-{op.pk}',
            'dDesProSer': f'Operación OP-{op.pk}',
            'cUniMed': '77',
            'dCantProSer': '1',
            'dPUniProSer': total,
            'iAfecIVA': '1' if int(config().get('IVA_TASA', 10)) else '3',
            'dPropIVA': '100' if int(config().get('IVA_TASA', 10)) else '0',
            'dTasaIVA': str(int(config().get('IVA_TASA', 10))),
        }]
    g_cam_item = [_item_nc(item, total, i + 1) for i, item in enumerate(items)]

    fecha_original = str(original.get('dFeEmiDE') or '')[:10]
    if not fecha_original:
        fecha_original = factura.creada.date().isoformat()
    motivo_texto = dict(MOTIVOS_NC)[motivo]

    return {
        'iTipEmi': str(original.get('iTipEmi') or '1'),
        'iTiDE': '5',
        'dNumTim': str(original.get('dNumTim') or emisor['dNumTim']),
        'dFeIniT': str(original.get('dFeIniT') or emisor['dFeIniT']),
        'dEst': str(original.get('dEst') or emisor['dEst']),
        'dPunExp': str(original.get('dPunExp') or emisor['dPunExp']),
        'dNumDoc': numero,
        'dFeEmiDE': timezone.localtime().strftime('%Y-%m-%dT%H:%M:%S'),
        'iTipTra': str(original.get('iTipTra') or '2'),
        'iTImp': str(original.get('iTImp') or '1'),
        'cMoneOpe': str(original.get('cMoneOpe') or 'PYG'),
        'dCondTiCam': str(original.get('dCondTiCam') or '1'),
        'dTiCam': str(original.get('dTiCam') or '1'),
        'dRucEm': str(original.get('dRucEm') or emisor['dRucEm']),
        'dDVEmi': str(original.get('dDVEmi') or emisor['dDVEmi']),
        'iTipCont': str(original.get('iTipCont') or emisor['iTipCont']),
        'dNomEmi': str(original.get('dNomEmi') or emisor['dNomEmi']),
        'dDirEmi': str(original.get('dDirEmi') or emisor['dDirEmi']),
        'dNumCas': str(original.get('dNumCas') or emisor['dNumCas']),
        'cDepEmi': str(original.get('cDepEmi') or emisor['cDepEmi']),
        'dDesDepEmi': str(original.get('dDesDepEmi') or emisor['dDesDepEmi']),
        **(
            {
                'cDisEmi': str(original.get('cDisEmi') or emisor.get('cDisEmi', '')),
                'dDesDisEmi': str(
                    original.get('dDesDisEmi') or emisor.get('dDesDisEmi', '')),
            }
            if str(emisor.get('cDisEmi', '')).strip()
            or str(original.get('cDisEmi', '')).strip()
            else {}
        ),
        'cCiuEmi': str(original.get('cCiuEmi') or emisor['cCiuEmi']),
        'dDesCiuEmi': str(original.get('dDesCiuEmi') or emisor['dDesCiuEmi']),
        'dTelEmi': str(original.get('dTelEmi') or emisor['dTelEmi']),
        'dEmailE': str(original.get('dEmailE') or emisor['dEmailE']),
        'gActEco': original.get('gActEco') or actividades_economicas(emisor),
        **receptor,
        'iMotEmi': motivo,
        'gCamDEAsoc': [{
            'iTipDocAso': '1',
            'dCdCDERef': factura.cdc,
            'dNTimDI': '0',
            'dEstDocAso': '0',
            'dPExpDocAso': '0',
            'dNumDocAso': '0',
            'iTipoDocAso': '1',
            'dFecEmiDI': fecha_original,
            'dNumComRet': '0',
            'dNumResCF': '0',
            'iTipCons': '0',
            'dNumCons': '0',
            'dNumControl': '0',
        }],
        'gCamItem': g_cam_item,
        'CDC': '0',
        'dCodSeg': '0',
        'dDVId': '0',
        'dSisFact': '1',
        'dInfAdic': (
            f'Nota de crédito de {factura.numero_completo or factura.cdc}. '
            f'{motivo_texto}. Operación OP-{op.pk}.'
        )[:500],
    }
