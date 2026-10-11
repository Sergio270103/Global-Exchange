"""Evaluación y disparo de alertas de tasas (PI-38).

Se invoca cada vez que se registra una cotización nueva: las alertas
en estado ``activa`` de esa moneda se comparan contra la tasa que
corresponda (venta si ``supera``, compra si ``baja``). Al cruzar el
umbral se registra el disparo en el historial, la alerta pasa a
``ejecutada`` (sin re-disparos) y se envía el aviso por correo —en
desarrollo sale por la consola (``console.EmailBackend``); con un
SMTP real configurado llega al correo del usuario (RF45/RF46).
"""

from django.core.mail import send_mail

from .models import AlertaTasa, DisparoAlerta


def evaluar_alertas(cotizacion) -> int:
    """Evalúa las alertas activas contra una cotización recién creada.

    Devuelve la cantidad de alertas disparadas.
    """
    disparadas = 0
    alertas = AlertaTasa.objects.filter(
        moneda=cotizacion.moneda,
    ).exclude(
        estado=AlertaTasa.ESTADO_PAUSADA,
    ).select_related('moneda')
    for alerta in alertas:
        if alerta.direccion == AlertaTasa.DIRECCION_SUPERA:
            tasa = cotizacion.venta
            cruza = tasa >= alerta.umbral
        else:
            tasa = cotizacion.compra
            cruza = tasa <= alerta.umbral
        if not cruza:
            # La tasa volvió al lado previo: se re-arma para avisar
            # el próximo cruce genuino (sin duplicar mientras siga
            # del mismo lado).
            if alerta.estado == AlertaTasa.ESTADO_EJECUTADA:
                alerta.estado = AlertaTasa.ESTADO_ACTIVA
                alerta.save(update_fields=['estado', 'actualizado'])
            continue
        if alerta.estado != AlertaTasa.ESTADO_ACTIVA:
            continue
        DisparoAlerta.objects.create(
            alerta=alerta, tasa_alcanzada=tasa,
            umbral=alerta.umbral, direccion=alerta.direccion,
        )
        alerta.estado = AlertaTasa.ESTADO_EJECUTADA
        alerta.save(update_fields=['estado', 'actualizado'])
        if alerta.usuario_email:
            verbo = 'alcanzó o superó' if alerta.direccion == 'supera' else 'bajó hasta'
            send_mail(
                f'Alerta de tasa: {alerta.moneda.codigo}/PYG',
                f'La tasa {verbo} {tasa} (umbral configurado: {alerta.umbral}).',
                None,
                [alerta.usuario_email],
                fail_silently=True,
            )
        disparadas += 1
    return disparadas
