"""Pruebas de comprobantes internos y del flujo cajero/efectivo (PI-42)."""

from decimal import Decimal

from django.utils import timezone
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


class AnulacionTest(APITestCase):
    """Anulación con reversa atómica en caja (emisor o admin)."""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.cajero = UsuarioFake(sub='sub-caja', username='Cajero', roles=('cashier',))
        self.admin = UsuarioFake(sub='sub-admin', username='Admin', roles=('admin',))
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
            cliente=self.cliente, keycloak_id='sub-caja', username='Cajero')
        from cajas.models import Caja, SaldoCaja, TurnoCaja
        # Caja semilla de la migración (la misma que elige la vista con first()).
        self.caja, _ = Caja.objects.get_or_create(
            nombre='Caja 1', sucursal='Casa Central')
        self.turno = TurnoCaja.objects.create(caja=self.caja, cajero_id='sub-caja')
        SaldoCaja.objects.create(caja=self.caja, moneda=self.pyg, monto=Decimal('10000000'))
        SaldoCaja.objects.create(caja=self.caja, moneda=self.usd, monto=Decimal('5000'))

    def _emitido(self):
        from operaciones.views import OperacionViewSet as OpVS
        req = self.factory.post('/api/operaciones/', {
            'cliente': self.cliente.id, 'tipo_operacion': 'COMPRA',
            'moneda': 'USD', 'monto_divisa': '100', 'metodo_pago': 'efectivo',
        }, format='json')
        force_authenticate(req, user=self.cajero)
        resp = OpVS.as_view({'post': 'create'})(req)
        self.assertEqual(resp.status_code, 201, resp.data)
        op = Operacion.objects.get(pk=resp.data['id'])
        req2 = self.factory.post(
            f'/api/operaciones/{op.pk}/confirmar/', {}, format='json')
        force_authenticate(req2, user=self.cajero)
        resp2 = OpVS.as_view({'post': 'confirmar'})(req2, pk=op.pk)
        self.assertEqual(resp2.data['resultado'], 'CONFIRMADA', resp2.data)
        req3 = self.factory.post(
            '/api/comprobantes/', {'operacion': op.pk}, format='json')
        force_authenticate(req3, user=self.cajero)
        resp3 = comprobante_view({'post': 'create'})(req3)
        self.assertEqual(resp3.status_code, 201, resp3.data)
        return Comprobante.objects.get(pk=resp3.data['id'])

    def _anular(self, user, comp_id, motivo=''):
        req = self.factory.post(
            f'/api/comprobantes/{comp_id}/anular/', {'motivo': motivo}, format='json')
        force_authenticate(req, user=user)
        return comprobante_view({'post': 'anular'})(req, pk=comp_id)

    def test_anula_y_revierte_en_caja(self):
        from cajas.models import MovimientoCaja, SaldoCaja
        comp = self._emitido()
        pyg_antes = SaldoCaja.objects.get(caja=self.caja, moneda=self.pyg).monto
        usd_antes = SaldoCaja.objects.get(caja=self.caja, moneda=self.usd).monto
        resp = self._anular(self.cajero, comp.pk, motivo=' error de monto')
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['estado'], 'anulado')
        self.assertEqual(resp.data['motivo_anulacion'], ' error de monto')
        comp.refresh_from_db()
        self.assertIsNotNone(comp.fecha_anulacion)
        self.assertEqual(comp.anulado_por_nombre, 'Cajero')
        # Espejo: sale lo ingresado (PYG) y vuelven los USD entregados.
        pyg_desp = SaldoCaja.objects.get(caja=self.caja, moneda=self.pyg).monto
        usd_desp = SaldoCaja.objects.get(caja=self.caja, moneda=self.usd).monto
        self.assertEqual(pyg_desp, pyg_antes - comp.monto_enviado)
        self.assertEqual(usd_desp, usd_antes + comp.monto_recibido)
        movs = MovimientoCaja.objects.filter(caja=self.caja).order_by('id')
        self.assertEqual(movs.count(), 2)
        self.assertEqual(movs[0].tipo, 'INGRESO')
        self.assertEqual(movs[1].tipo, 'RETIRO')
        self.assertIn(f'Reversa {comp.numero}', movs[0].observacion)

    def test_admin_tambien_anula(self):
        comp = self._emitido()
        resp = self._anular(self.admin, comp.pk)
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['estado'], 'anulado')

    def test_doble_anulacion_rechazada(self):
        from cajas.models import MovimientoCaja
        comp = self._emitido()
        self.assertEqual(self._anular(self.cajero, comp.pk).status_code, 200)
        resp = self._anular(self.cajero, comp.pk)
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(MovimientoCaja.objects.filter(caja=self.caja).count(), 2)

    def test_sin_permiso_rechazado(self):
        asociado = UsuarioFake(sub='sub-asoc', username='Asoc')
        ClienteUsuario.objects.create(
            cliente=self.cliente, keycloak_id='sub-asoc', username='Asoc')
        comp = self._emitido()
        resp = self._anular(asociado, comp.pk)
        self.assertEqual(resp.status_code, 403)

    def test_caja_cerrada_rechazada(self):
        from cajas.models import MovimientoCaja
        self.turno.cerrado_en = timezone.now()
        self.turno.save(update_fields=['cerrado_en'])
        comp = self._emitido()
        resp = self._anular(self.cajero, comp.pk)
        self.assertEqual(resp.status_code, 400)
        comp.refresh_from_db()
        self.assertEqual(comp.estado, 'emitido')
        self.assertEqual(MovimientoCaja.objects.filter(caja=self.caja).count(), 0)

    def test_sin_saldo_rechazada_sin_efecto(self):
        from cajas.models import MovimientoCaja, SaldoCaja
        SaldoCaja.objects.filter(caja=self.caja, moneda=self.pyg).update(monto=Decimal('0'))
        comp = self._emitido()
        resp = self._anular(self.cajero, comp.pk)
        self.assertEqual(resp.status_code, 400)
        comp.refresh_from_db()
        self.assertEqual(comp.estado, 'emitido')
        self.assertEqual(MovimientoCaja.objects.filter(caja=self.caja).count(), 0)

    def test_anula_pasa_la_operacion_a_cancelada(self):
        from billeteras.models import Billetera, Movimiento
        comp = self._emitido()
        op = Operacion.objects.get(pk=comp.operacion_id)
        # Rama defensiva: si la operación movió billeteras, se revierten.
        b_pyg = Billetera.objects.create(
            cliente=self.cliente, moneda=self.pyg, saldo=Decimal('5000'))
        b_usd = Billetera.objects.create(
            cliente=self.cliente, moneda=self.usd, saldo=Decimal('500'))
        op.billetera_origen = b_pyg
        op.billetera_destino = b_usd
        op.save(update_fields=['billetera_origen', 'billetera_destino'])
        resp = self._anular(self.cajero, comp.pk)
        self.assertEqual(resp.status_code, 200, resp.data)
        op.refresh_from_db()
        self.assertEqual(op.estado, 'CANCELADA')
        self.assertEqual(op.motivo_cancelacion, 'ANULADA')
        self.assertIsNotNone(op.fecha_cancelacion)
        self.assertEqual(op.cancelada_por_nombre, 'Cajero')
        b_pyg.refresh_from_db()
        b_usd.refresh_from_db()
        self.assertEqual(b_pyg.saldo, Decimal('5000') + op.monto_enviado)
        self.assertEqual(b_usd.saldo, Decimal('500') - op.monto_recibido)
        movs = Movimiento.objects.filter(operacion=op).order_by('id')
        self.assertEqual(movs.count(), 2)
        self.assertEqual(movs[0].tipo, 'CREDITO')
        self.assertEqual(movs[1].tipo, 'DEBITO')

    def test_no_anula_medio_no_presencial(self):
        comp = self._emitido()
        comp.metodo_pago = 'transfer'
        comp.save(update_fields=['metodo_pago'])
        resp = self._anular(self.cajero, comp.pk)
        self.assertEqual(resp.status_code, 400)
        comp.refresh_from_db()
        self.assertEqual(comp.estado, 'emitido')

    def test_anula_tarjeta_revierte_solo_la_salida(self):
        from cajas.models import MovimientoCaja, SaldoCaja
        comp = self._emitido()
        comp.metodo_pago = 'tarjeta'
        comp.save(update_fields=['metodo_pago'])
        pyg_antes = SaldoCaja.objects.get(caja=self.caja, moneda=self.pyg).monto
        usd_antes = SaldoCaja.objects.get(caja=self.caja, moneda=self.usd).monto
        resp = self._anular(self.cajero, comp.pk)
        self.assertEqual(resp.status_code, 200, resp.data)
        # Con tarjeta nada entró: solo vuelve lo entregado (USD).
        movs = MovimientoCaja.objects.filter(caja=self.caja).order_by('id')
        self.assertEqual(movs.count(), 1)
        self.assertEqual(movs[0].tipo, 'INGRESO')
        self.assertEqual(
            SaldoCaja.objects.get(caja=self.caja, moneda=self.usd).monto,
            usd_antes + comp.monto_recibido)
        self.assertEqual(
            SaldoCaja.objects.get(caja=self.caja, moneda=self.pyg).monto, pyg_antes)
        op = Operacion.objects.get(pk=comp.operacion_id)
        self.assertEqual(op.estado, 'CANCELADA')
