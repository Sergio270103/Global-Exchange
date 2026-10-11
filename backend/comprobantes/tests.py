"""Pruebas de comprobantes internos y del flujo cajero/efectivo (PI-42)."""

from decimal import Decimal

from rest_framework.test import APIRequestFactory, APITestCase, force_authenticate

from clientes.models import Cliente, ClienteUsuario, Comision
from cotizaciones.models import Cotizacion
from monedas.models import Moneda
from operaciones.models import Operacion
from operaciones.views import OperacionViewSet

from .models import Comprobante
from .views import ComprobanteViewSet


class UsuarioFake:
    def __init__(self, sub='sub-123', username='tester', roles=()):
        self.id = sub
        self.username = username
        self.nombre = username
        self.email = f'{sub}@mail.com'
        self.roles = list(roles)
        self.is_superuser = False

    @property
    def is_authenticated(self):
        return True

    def __str__(self):
        return self.username


def comprobante_view(acciones):
    return ComprobanteViewSet.as_view(acciones)


class ComprobanteTest(APITestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.user = UsuarioFake()
        self.cajero = UsuarioFake(sub='sub-caja', username='Cajero', roles=('cashier',))
        self.otro = UsuarioFake(sub='sub-otro')
        self.pyg, _ = Moneda.objects.get_or_create(
            codigo='PYG', defaults={'nombre': 'Guaraní', 'decimales': 0})
        self.usd, _ = Moneda.objects.get_or_create(
            codigo='USD', defaults={'nombre': 'Dólar', 'decimales': 2})
        Cotizacion.objects.create(
            moneda=self.usd, compra=Decimal('7400'), venta=Decimal('7500'))
        self.cliente = Cliente.objects.create(
            nombre='Cliente Test', documento='123', email='c@test.com',
            categoria=Cliente.CAT_MINORISTA)
        Comision.objects.update_or_create(
            categoria=Cliente.CAT_MINORISTA,
            defaults={'porcentaje': Decimal('1.00')})
        ClienteUsuario.objects.create(
            cliente=self.cliente, keycloak_id='sub-123', username='tester')

    def _operacion_pagada(self, user, cliente_id, tipo='COMPRA', metodo=''):
        datos = {
            'cliente': cliente_id, 'tipo_operacion': tipo,
            'moneda': 'USD', 'monto_divisa': '100', 'metodo_pago': metodo,
        }
        req = self.factory.post('/api/operaciones/', datos, format='json')
        force_authenticate(req, user=user)
        resp = OperacionViewSet.as_view({'post': 'create'})(req)
        self.assertEqual(resp.status_code, 201, resp.data)
        op = Operacion.objects.get(pk=resp.data['id'])
        req2 = self.factory.post(f'/api/operaciones/{op.pk}/confirmar/', {}, format='json')
        force_authenticate(req2, user=user)
        resp2 = OperacionViewSet.as_view({'post': 'confirmar'})(req2, pk=op.pk)
        self.assertEqual(resp2.data['resultado'], 'CONFIRMADA', resp2.data)
        return Operacion.objects.get(pk=op.pk)

    def _emitir(self, user, operacion_id):
        req = self.factory.post('/api/comprobantes/', {'operacion': operacion_id}, format='json')
        force_authenticate(req, user=user)
        return comprobante_view({'post': 'create'})(req)

    def test_emite_con_numero_unico_secuencial(self):
        op = self._operacion_pagada(self.user, self.cliente.id)
        resp = self._emitir(self.user, op.pk)
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertRegex(resp.data['numero'], r'^CPB-\d{6}$')
        self.assertEqual(resp.data['cliente_documento'], '123')
        self.assertEqual(resp.data['tipo_operacion'], 'COMPRA')
        op2 = self._operacion_pagada(self.user, self.cliente.id)
        resp2 = self._emitir(self.user, op2.pk)
        self.assertNotEqual(resp.data['numero'], resp2.data['numero'])

    def test_solo_operacion_pagada(self):
        req = self.factory.post('/api/operaciones/', {
            'cliente': self.cliente.id, 'tipo_operacion': 'COMPRA',
            'moneda': 'USD', 'monto_divisa': '100'}, format='json')
        force_authenticate(req, user=self.user)
        resp = OperacionViewSet.as_view({'post': 'create'})(req)
        op = Operacion.objects.get(pk=resp.data['id'])
        self.assertEqual(op.estado, 'PENDIENTE')
        resp2 = self._emitir(self.user, op.pk)
        self.assertEqual(resp2.status_code, 400)

    def test_no_duplica_comprobante(self):
        op = self._operacion_pagada(self.user, self.cliente.id)
        self.assertEqual(self._emitir(self.user, op.pk).status_code, 201)
        self.assertEqual(self._emitir(self.user, op.pk).status_code, 400)
        self.assertEqual(Comprobante.objects.count(), 1)

    def test_aislamiento_por_usuario(self):
        op = self._operacion_pagada(self.user, self.cliente.id)
        resp = self._emitir(self.otro, op.pk)
        self.assertEqual(resp.status_code, 403)
        req = self.factory.get('/api/comprobantes/')
        force_authenticate(req, user=self.otro)
        resp2 = comprobante_view({'get': 'list'})(req)
        self.assertEqual(len(resp2.data), 0)

    def test_cajero_opera_sin_asociacion_en_efectivo(self):
        for tipo in ('COMPRA', 'VENTA'):
            op = self._operacion_pagada(
                self.cajero, self.cliente.id, tipo=tipo, metodo='efectivo')
            self.assertEqual(op.estado, 'PAGADA')
            self.assertEqual(op.usuario_keycloak_id, 'sub-caja')
            self.assertIsNone(op.billetera_origen_id)
            self.assertIsNone(op.billetera_destino_id)
            resp = self._emitir(self.cajero, op.pk)
            self.assertEqual(resp.status_code, 201, resp.data)
            self.assertEqual(resp.data['cajero_nombre'], 'Cajero')

    def test_efectivo_rechaza_billeteras_y_usuarios_normales(self):
        req = self.factory.post('/api/operaciones/', {
            'cliente': self.cliente.id, 'tipo_operacion': 'COMPRA',
            'moneda': 'USD', 'monto_divisa': '100',
            'metodo_pago': 'efectivo', 'billetera_destino': 999}, format='json')
        force_authenticate(req, user=self.cajero)
        resp = OperacionViewSet.as_view({'post': 'create'})(req)
        self.assertEqual(resp.status_code, 400)
        req2 = self.factory.post('/api/operaciones/', {
            'cliente': self.cliente.id, 'tipo_operacion': 'COMPRA',
            'moneda': 'USD', 'monto_divisa': '100',
            'metodo_pago': 'efectivo'}, format='json')
        force_authenticate(req2, user=self.user)
        resp2 = OperacionViewSet.as_view({'post': 'create'})(req2)
        self.assertEqual(resp2.status_code, 400)

    def test_cajero_ve_sus_comprobantes_y_reimprime(self):
        op = self._operacion_pagada(
            self.cajero, self.cliente.id, metodo='efectivo')
        self._emitir(self.cajero, op.pk)
        req = self.factory.get('/api/comprobantes/')
        force_authenticate(req, user=self.cajero)
        resp = comprobante_view({'get': 'list'})(req)
        self.assertEqual(len(resp.data), 1)
        comp_id = resp.data[0]['id']
        req2 = self.factory.get(f'/api/comprobantes/{comp_id}/')
        force_authenticate(req2, user=self.cajero)
        resp2 = comprobante_view({'get': 'retrieve'})(req2, pk=comp_id)
        self.assertEqual(resp2.status_code, 200)
        self.assertRegex(resp2.data['numero'], r'^CPB-')

    def test_foto_inmutable(self):
        op = self._operacion_pagada(self.user, self.cliente.id)
        resp = self._emitir(self.user, op.pk)
        numero = resp.data['numero']
        op.monto_recibido = Decimal('1')
        op.save(update_fields=['monto_recibido'])
        comp = Comprobante.objects.get(numero=numero)
        self.assertEqual(comp.monto_recibido, Decimal('100'))
