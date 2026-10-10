"""Tests del cobro por Stripe Checkout y su webhook.

Se mockea el SDK (`Session.create` y `Webhook.construct_event`): ningún
test toca la red. Flujo: `iniciar-pago` crea la sesión y guarda su id;
el webhook marca PAGADA al acreditarse o CANCELADA (PAGO_FALLIDO) al
expirar/rechazarse. `confirmar` rechaza operaciones con pasarela.
"""

from decimal import Decimal
from unittest.mock import patch

import stripe
from django.test import TestCase, override_settings
from rest_framework.test import APIRequestFactory, force_authenticate

from clientes.models import Cliente, ClienteUsuario, Comision
from cotizaciones.models import Cotizacion
from monedas.models import Moneda
from pagos.stripe_pagos import monto_menor_unidad
from pagos.views import webhook_stripe

from .models import Operacion
from .views import OperacionViewSet


class UsuarioFake:
    id = 'sub-123'
    username = 'tester'
    is_authenticated = True
    roles = []


def _auth(view, request, **kwargs):
    force_authenticate(request, user=UsuarioFake())
    return view(request, **kwargs)


SESION = {'id': 'cs_test_123', 'url': 'https://checkout.stripe.com/pay/cs_test_123'}


def _evento(tipo, sesion_id='cs_test_123', pagado=True):
    return {
        'type': tipo,
        'data': {'object': {
            'id': sesion_id,
            'payment_status': 'paid' if pagado else 'unpaid',
        }},
    }


class StripePagosTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.pyg, _ = Moneda.objects.get_or_create(
            codigo='PYG', defaults={'nombre': 'Guaraní', 'decimales': 0},
        )
        self.usd, _ = Moneda.objects.get_or_create(
            codigo='USD', defaults={'nombre': 'Dólar', 'decimales': 2},
        )
        Cotizacion.objects.create(moneda=self.usd, compra=Decimal('7400'), venta=Decimal('7500'))
        self.cliente = Cliente.objects.create(
            nombre='Cliente Test', documento='123', email='c@test.com',
            categoria=Cliente.CAT_MINORISTA,
        )
        Comision.objects.update_or_create(
            categoria=Cliente.CAT_MINORISTA,
            defaults={'porcentaje': Decimal('1.00')},
        )
        ClienteUsuario.objects.create(
            cliente=self.cliente, keycloak_id='sub-123', username='tester',
        )

    def _operacion(self, tipo='COMPRA', metodo='card', estado=Operacion.ESTADO_PENDIENTE):
        return Operacion.objects.create(
            cliente=self.cliente, usuario_keycloak_id='sub-123',
            tipo_operacion=tipo, moneda_origen=self.pyg, moneda_destino=self.usd,
            monto_enviado=Decimal('757500'), monto_recibido=Decimal('100'),
            cotizacion_aplicada=Decimal('7500'),
            porcentaje_comision_aplicado=Decimal('1'),
            monto_comision=Decimal('1'), metodo_pago=metodo, estado=estado,
        )

    def test_monto_menor_unidad(self):
        self.assertEqual(monto_menor_unidad(Decimal('757500'), 'PYG'), 757500)
        self.assertEqual(monto_menor_unidad(Decimal('100'), 'USD'), 10000)
        self.assertEqual(monto_menor_unidad(Decimal('10.455'), 'USD'), 1046)

    @override_settings(STRIPE_SECRET_KEY='sk_test_x')
    def test_iniciar_pago_crea_sesion(self):
        op = self._operacion()
        vista = OperacionViewSet.as_view({'post': 'iniciar_pago'})
        with patch('stripe.checkout.Session.create', return_value=dict(SESION)) as crear:
            res = _auth(vista, self.factory.post(f'/api/operaciones/{op.id}/iniciar-pago/'), pk=op.pk)
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data['url'], SESION['url'])
        op.refresh_from_db()
        self.assertEqual(op.stripe_session_id, 'cs_test_123')
        _, kwargs = crear.call_args
        item = kwargs['line_items'][0]['price_data']
        self.assertEqual(item['currency'], 'pyg')
        self.assertEqual(item['unit_amount'], 757500)
        self.assertEqual(kwargs['metadata'], {'operacion_id': str(op.id)})

    def test_iniciar_pago_rechaza_wallet(self):
        op = self._operacion(metodo='wallet')
        vista = OperacionViewSet.as_view({'post': 'iniciar_pago'})
        res = _auth(vista, self.factory.post(f'/api/operaciones/{op.id}/iniciar-pago/'), pk=op.pk)
        self.assertEqual(res.status_code, 400)

    def test_iniciar_pago_solo_pendiente(self):
        op = self._operacion(estado=Operacion.ESTADO_PAGADA)
        vista = OperacionViewSet.as_view({'post': 'iniciar_pago'})
        res = _auth(vista, self.factory.post(f'/api/operaciones/{op.id}/iniciar-pago/'), pk=op.pk)
        self.assertEqual(res.status_code, 400)

    def test_confirmar_rechaza_pasarela(self):
        op = self._operacion()
        vista = OperacionViewSet.as_view({'post': 'confirmar'})
        res = _auth(vista, self.factory.post(f'/api/operaciones/{op.id}/confirmar/'), pk=op.pk)
        self.assertEqual(res.status_code, 400)
        self.assertIn('pasarela', res.data['detail'])

    def test_create_venta_card_sin_debito_interno(self):
        vista = OperacionViewSet.as_view({'post': 'create'})
        req = self.factory.post('/api/operaciones/', {
            'cliente': self.cliente.id, 'tipo_operacion': 'VENTA',
            'moneda': 'USD', 'monto_divisa': '10', 'metodo_pago': 'card',
        }, format='json')
        res = _auth(vista, req)
        self.assertEqual(res.status_code, 201, res.data)
        op = Operacion.objects.get()
        self.assertIsNone(op.billetera_origen)
        self.assertEqual(op.estado, Operacion.ESTADO_PENDIENTE)

    def _webhook(self, evento):
        req = self.factory.post(
            '/api/payments/webhook/', data='{}',
            content_type='application/json',
            HTTP_STRIPE_SIGNATURE='t=1,v1=firma',
        )
        # Event real (como lo devuelve el SDK v16) para ejercitar la conversión a dict.
        real = stripe.Event.construct_from(evento, key='sk_test_x')
        with patch('stripe.Webhook.construct_event', return_value=real):
            return webhook_stripe(req)

    @override_settings(STRIPE_WEBHOOK_SECRET='whsec_x')
    def test_webhook_pagado_marca_pagada(self):
        op = self._operacion()
        op.stripe_session_id = 'cs_test_123'
        op.save(update_fields=['stripe_session_id'])
        res = self._webhook(_evento('checkout.session.completed'))
        self.assertEqual(res.status_code, 200)
        op.refresh_from_db()
        self.assertEqual(op.estado, Operacion.ESTADO_PAGADA)

    @override_settings(STRIPE_WEBHOOK_SECRET='whsec_x')
    def test_webhook_expirado_cancela_con_motivo(self):
        op = self._operacion()
        op.stripe_session_id = 'cs_test_123'
        op.save(update_fields=['stripe_session_id'])
        res = self._webhook(_evento('checkout.session.expired'))
        self.assertEqual(res.status_code, 200)
        op.refresh_from_db()
        self.assertEqual(op.estado, Operacion.ESTADO_CANCELADA)
        self.assertEqual(op.motivo_cancelacion, Operacion.MOTIVO_PAGO_FALLIDO)

    @override_settings(STRIPE_WEBHOOK_SECRET='whsec_x')
    def test_webhook_ignora_sesion_vieja_y_no_pendiente(self):
        op = self._operacion()
        op.stripe_session_id = 'cs_nueva'
        op.save(update_fields=['stripe_session_id'])
        self._webhook(_evento('checkout.session.expired', sesion_id='cs_vieja'))
        op.refresh_from_db()
        self.assertEqual(op.estado, Operacion.ESTADO_PENDIENTE)

        op.estado = Operacion.ESTADO_PAGADA
        op.save(update_fields=['estado'])
        self._webhook(_evento('checkout.session.expired', sesion_id='cs_nueva'))
        op.refresh_from_db()
        self.assertEqual(op.estado, Operacion.ESTADO_PAGADA)
        self.assertEqual(op.motivo_cancelacion, '')

    def test_webhook_firma_invalida_400(self):
        req = self.factory.post(
            '/api/payments/webhook/', data='{}',
            content_type='application/json',
            HTTP_STRIPE_SIGNATURE='t=1,v1=mala',
        )
        with patch(
            'stripe.Webhook.construct_event',
            side_effect=stripe.SignatureVerificationError('mala', 'sig'),
        ):
            res = webhook_stripe(req)
        self.assertEqual(res.status_code, 400)
