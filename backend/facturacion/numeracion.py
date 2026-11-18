"""Correlativos por tipo y serie fiscal, con reserva bajo bloqueo de fila."""
from django.db import transaction
from . import cliente_fs
from .models import CorrelativoDocumento, FacturaElectronica, NotaCreditoElectronica


def serie(de=None):
    de = de if de is not None else cliente_fs.config()['EMISOR']
    return dict(establecimiento=str(de.get('dEst', '')),
                punto_expedicion=str(de.get('dPunExp', '')),
                timbrado=str(de.get('dNumTim', '')))


def usados(tipo, simulada, de=None):
    modelo = FacturaElectronica if tipo == '1' else NotaCreditoElectronica
    valores = modelo.objects.filter(simulada=simulada, numero__isnull=False,
        **serie(de)).values_list('numero', flat=True)
    return {int(n) for n in valores if str(n).isdigit()}


def limites(tipo):
    cfg = cliente_fs.config()
    if tipo == '1':
        return int(cfg['NUMERO_DESDE']), int(cfg['NUMERO_HASTA'])
    return int(cfg.get('NC_NUMERO_DESDE', 13)), int(cfg.get('NC_NUMERO_HASTA', 24))


def siguiente(tipo, simulada, de=None):
    desde, hasta = limites(tipo)
    contador = CorrelativoDocumento.objects.filter(tipo=tipo, simulada=simulada, **serie(de)).first()
    ultimo = max(usados(tipo, simulada, de) | {desde - 1, contador.ultimo if contador else 0})
    return f'{ultimo + 1:07d}' if ultimo < min(hasta, 9999999) else None


@transaction.atomic
def reservar(tipo, simulada, de):
    contador, _ = CorrelativoDocumento.objects.select_for_update().get_or_create(
        tipo=tipo, simulada=simulada, **serie(de))
    numero = siguiente(tipo, simulada, de)
    if numero is None:
        raise cliente_fs.ErrorFacturaSegura('Se alcanzó el límite del rango de numeración.')
    contador.ultimo = int(numero)
    contador.save(update_fields=['ultimo'])
    return numero


@transaction.atomic
def liberar(tipo, documento):
    # Solo ante rechazo explícito previo a generar, nunca ante timeout/colisión.
    contador = CorrelativoDocumento.objects.select_for_update().get(
        tipo=tipo, simulada=documento.simulada, **serie(documento.de_enviado))
    if contador.ultimo == int(documento.numero):
        contador.ultimo -= 1
        contador.save(update_fields=['ultimo'])


def generar(documento, tipo):
    """Hasta cinco envíos, únicamente NUMDOC_APROBADO habilita otro número."""
    for intento in range(1, 6):
        de = dict(documento.de_enviado)
        try:
            return cliente_fs.generar_de(de)
        except cliente_fs.ErrorFacturaSegura as exc:
            codigo = exc.code if exc.code is not None else exc.respuesta.get('code')
            descripcion = f"{exc} {exc.respuesta.get('description', '')}"
            ocupado = str(codigo) == '-10101' or 'NUMDOC_APROBADO' in descripcion.upper()
            documento.intentos_numeracion.append({
                'numero': documento.numero, 'code': exc.code, 'detalle': str(exc)[:500]})
            documento.save(update_fields=['intentos_numeracion'])
            if not ocupado:
                liberar(tipo, documento)
                raise
            if intento == 5:
                raise cliente_fs.ErrorFacturaSegura(
                    'No se encontró número libre tras 5 intentos: NUMDOC_APROBADO.',
                    code=-10101, respuesta=exc.respuesta) from exc
            if tipo == '1':
                from .cupos import numeros_para_reintento
                if numeros_para_reintento(documento.simulada) <= 0:
                    raise cliente_fs.ErrorFacturaSegura(
                        'No quedan números libres para reintentar sin afectar otros cupos reservados.',
                        code=-10101, respuesta=exc.respuesta) from exc
            numero = reservar(tipo, documento.simulada, de)
            de = dict(de)
            de['dNumDoc'] = numero
            documento.numero = numero
            documento.numero_completo = f"{de['dEst']}-{de['dPunExp']}-{numero}"
            documento.de_enviado = de
            documento.save(update_fields=['numero', 'numero_completo', 'de_enviado'])
