"""Cobro por Stripe Checkout con redirect externo.

- ``crear_sesion_checkout()``: crea la Checkout Session por el
  ``monto_enviado`` en ``moneda_origen`` (lo que el cliente entrega; en
  COMPRA ya incluye la comisión) y devuelve la sesión con su ``url``.
  Las monedas sin centavos (PYG, CLP, …) se envían en unidades enteras.
  La sesión expira a los 30 minutos (mínimo de Stripe).
- ``sesion_abierta()``: devuelve la URL de una sesión guardada si sigue
  abierta, para retomar el pago sin crear otra.
- Solo ``card`` pasa por acá (``settings.STRIPE_METODOS``);
  ``transfer`` es confirmación directa y ``wallet`` es saldo interno.
"""

import time
from decimal import Decimal, ROUND_HALF_UP

import stripe
from django.conf import settings


class ErrorPasarela(Exception):
    """Error de negocio con la pasarela; el mensaje va al frontend."""


#: Monedas sin centavos según Stripe (se cobran en unidades enteras).
CERO_DECIMALES = frozenset({
    'BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA',
    'PYG', 'RWF', 'UGX', 'UYI', 'VND', 'VUV', 'XAF', 'XOF', 'XPF',
})


def monto_menor_unidad(monto: Decimal, codigo: str) -> int:
    """Convierte un monto a la menor unidad que pide Stripe."""
    monto = Decimal(str(monto))
    if codigo.strip().upper() in CERO_DECIMALES:
        return int(monto.to_integral_value(rounding=ROUND_HALF_UP))
    return int((monto * 100).to_integral_value(rounding=ROUND_HALF_UP))


def crear_sesion_checkout(operacion):
    """Crea la Checkout Session de una operación PENDIENTE.

    Guarda nada: el llamador persiste ``session['id']`` en
    ``operacion.stripe_session_id``.
    """
    if not settings.STRIPE_SECRET_KEY:
        raise ErrorPasarela('Pasarela de pago no configurada.')
    stripe.api_key = settings.STRIPE_SECRET_KEY

    codigo = operacion.moneda_origen.codigo.strip().upper()
    monto = monto_menor_unidad(operacion.monto_enviado, codigo)
    if monto <= 0:
        raise ErrorPasarela('El monto a cobrar debe ser mayor a cero.')

    base = settings.FRONTEND_URL.rstrip('/')
    try:
        return stripe.checkout.Session.create(
            mode='payment',
            expires_at=int(time.time()) + 30 * 60,
            line_items=[{
                'price_data': {
                    'currency': codigo.lower(),
                    'unit_amount': monto,
                    'product_data': {
                        'name': (
                            f'Global Exchange #{operacion.id}: '
                            f'{operacion.get_tipo_operacion_display()}'
                        ),
                    },
                },
                'quantity': 1,
            }],
            metadata={'operacion_id': str(operacion.id)},
            client_reference_id=str(operacion.id),
            success_url=f'{base}/?pago=exito&op={operacion.id}',
            cancel_url=f'{base}/?pago=cancelado&op={operacion.id}',
        )
    except stripe.StripeError as err:
        raise ErrorPasarela(
            getattr(err, 'user_message', None) or str(err) or 'No se pudo crear la sesión de pago.',
        )


def sesion_abierta(sesion_id: str | None) -> str | None:
    """URL de la sesión guardada si sigue abierta, o None.

    Permite retomar el pago (mismo monto y cotización congelada) sin
    crear otra sesión. Nunca lanza: ante cualquier error se crea nueva.
    """
    if not sesion_id or not settings.STRIPE_SECRET_KEY:
        return None
    stripe.api_key = settings.STRIPE_SECRET_KEY
    try:
        sesion = stripe.checkout.Session.retrieve(sesion_id)
        if sesion['status'] != 'open' or not sesion['url']:
            return None
        return sesion['url']
    except (stripe.StripeError, KeyError):
        return None
