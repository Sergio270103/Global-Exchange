from unittest.mock import patch
from django.db import transaction
from django.test import override_settings
from rest_framework.test import force_authenticate
from billeteras.models import Billetera, Movimiento
from operaciones.models import Operacion
from operaciones.views import OperacionViewSet
from . import cupos, servicios
from .models import ReservaEmision, CorrelativoDocumento, FacturaElectronica
from .tests import FacturacionTestBase, config


@override_settings(FACTURASEGURA=config(desde=100, hasta=100))
class CuposTest(FacturacionTestBase):
    @override_settings(FACTURASEGURA=config(desde=100, hasta=199))
    def test_limite_operativo_49_bloquea_aunque_queden_numeros(self):
        op = self.operacion(pagar=False)
        FacturaElectronica.objects.bulk_create([
            FacturaElectronica(operacion=op, simulada=True, estado='ERROR',
                consume_emision=True, **servicios.numeracion.serie()) for _ in range(49)])
        self.assertIsNotNone(servicios.siguiente_numero(True))
        self.assertEqual(self.confirmar(op).status_code, 400)
        op.refresh_from_db()
        self.assertEqual(op.estado, 'PENDIENTE')

    def test_emision_historica_no_roba_cupo_reservado(self):
        reservada = self.operacion()
        historica = self.operacion(pagar=False)
        historica.estado = 'PAGADA'
        historica.save()
        self.assertEqual(self.emitir(historica).status_code, 400)
        self.assertEqual(self.emitir(reservada).status_code, 201)

    def confirmar(self, op, accion='confirmar'):
        req = self.factory.post('/api/operaciones/', {}, format='json')
        force_authenticate(req, user=self.user)
        return OperacionViewSet.as_view({'post': accion})(req, pk=op.pk)

    def test_compra_y_venta_sin_cupo_no_mueven_billeteras(self):
        self.operacion()  # reserva el último cupo sin emitir todavía
        for tipo in ['COMPRA', 'VENTA']:
            op = self.operacion(pagar=False, tipo=tipo)
            origen, _ = Billetera.objects.get_or_create(cliente=self.cliente,
                moneda=op.moneda_origen, defaults={'saldo': 1000000})
            destino, _ = Billetera.objects.get_or_create(cliente=self.cliente,
                moneda=op.moneda_destino, defaults={'saldo': 1000000})
            op.billetera_origen = origen
            op.billetera_destino = destino
            op.save()
            saldos = (origen.saldo, destino.saldo)
            resp = self.confirmar(op)
            self.assertEqual(resp.status_code, 400, resp.data)
            self.assertIn('no fue confirmada', str(resp.data))
            op.refresh_from_db(); origen.refresh_from_db(); destino.refresh_from_db()
            self.assertEqual(op.estado, 'PENDIENTE')
            self.assertEqual((origen.saldo, destino.saldo), saldos)
            self.assertFalse(Movimiento.objects.filter(operacion=op).exists())
            self.assertFalse(ReservaEmision.objects.filter(operacion=op).exists())

    def test_ultimo_cupo_se_puede_emitir_y_no_se_cuenta_dos_veces(self):
        op = self.operacion()
        self.assertEqual(servicios.uso()['disponibles'], 0)
        self.assertEqual(self.ver_uso(op).data['disponibles'], 1)
        self.assertEqual(self.emitir(op).status_code, 201)
        self.assertTrue(ReservaEmision.objects.get(operacion=op).consumida)
        self.assertEqual(servicios.uso()['usadas'], 1)
        self.assertEqual(servicios.uso()['disponibles'], 0)

    def test_reserva_idempotente_y_cancelacion_libera_cupo(self):
        op = self.operacion(pagar=False)
        cupos.reservar(op)
        cupos.reservar(op)
        self.assertEqual(ReservaEmision.objects.count(), 1)
        op.estado = 'CANCELADA'
        op.save()
        self.assertEqual(servicios.uso()['disponibles'], 1)
        self.assertEqual(self.operacion().estado, 'PAGADA')

    def test_rollback_no_deja_reserva(self):
        op = self.operacion(pagar=False)
        with self.assertRaises(RuntimeError):
            with transaction.atomic():
                cupos.reservar(op)
                raise RuntimeError('fallo posterior al reservar')
        self.assertFalse(ReservaEmision.objects.exists())
        self.assertEqual(servicios.uso()['disponibles'], 1)

    def test_rango_agotado_bloquea_aunque_no_haya_facturas_locales(self):
        CorrelativoDocumento.objects.create(tipo='1', simulada=True,
            **servicios.numeracion.serie(), ultimo=100)
        self.assertEqual(self.confirmar(self.operacion(pagar=False)).status_code, 400)

    def test_stripe_no_inicia_cobro_sin_cupo(self):
        self.operacion()
        op = self.operacion(pagar=False)
        op.metodo_pago = 'card'
        op.save()
        with patch('pagos.stripe_pagos.crear_sesion_checkout') as cobrar:
            resp = self.confirmar(op, 'iniciar_pago')
        self.assertEqual(resp.status_code, 400)
        cobrar.assert_not_called()

    def test_stripe_reserva_antes_de_checkout_y_webhook_reutiliza(self):
        op = self.operacion(pagar=False)
        op.metodo_pago = 'card'
        op.save()
        def checkout(operacion):
            self.assertTrue(ReservaEmision.objects.filter(operacion=op).exists())
            return {'id': 'cs_test', 'url': 'https://example.com'}
        with patch('pagos.stripe_pagos.sesion_abierta', return_value=None), patch(
                'pagos.stripe_pagos.crear_sesion_checkout', side_effect=checkout):
            self.assertEqual(self.confirmar(op, 'iniciar_pago').status_code, 200)
        with transaction.atomic():
            resp = OperacionViewSet()._marcar_confirmada(op)
        self.assertEqual(resp.data['resultado'], 'CONFIRMADA')
        self.assertEqual(ReservaEmision.objects.count(), 1)

    def test_error_checkout_revierte_reserva(self):
        from pagos.stripe_pagos import ErrorPasarela
        op = self.operacion(pagar=False)
        op.metodo_pago = 'card'
        op.save()
        with patch('pagos.stripe_pagos.sesion_abierta', return_value=None), patch(
                'pagos.stripe_pagos.crear_sesion_checkout', side_effect=ErrorPasarela('fallo')):
            self.assertEqual(self.confirmar(op, 'iniciar_pago').status_code, 400)
        self.assertFalse(ReservaEmision.objects.exists())

    def test_error_previo_a_generar_conserva_reserva_para_reintentar(self):
        from .cliente_fs import ErrorFacturaSegura
        op = self.operacion()
        with patch('facturacion.cliente_fs.generar_de', side_effect=ErrorFacturaSegura('error')):
            self.assertEqual(self.emitir(op).status_code, 400)
        self.assertFalse(ReservaEmision.objects.get(operacion=op).consumida)
        self.assertEqual(servicios.uso()['disponibles'], 0)
        self.assertEqual(self.emitir(op).status_code, 201)

    @override_settings(FACTURASEGURA=config(desde=100, hasta=101))
    def test_colision_no_gasta_numero_reservado_por_otra_operacion(self):
        from .cliente_fs import ErrorFacturaSegura
        primera = self.operacion()
        segunda = self.operacion()
        with patch('facturacion.cliente_fs.generar_de', side_effect=ErrorFacturaSegura(
                'NUMDOC_APROBADO', code=-10101)) as generar:
            self.assertEqual(self.emitir(primera).status_code, 400)
        self.assertEqual(generar.call_count, 1)
        self.assertEqual(self.emitir(segunda).status_code, 201)
