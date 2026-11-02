from unittest import mock
from django.test import override_settings
from .tests import FacturacionTestBase, config
from . import servicios, cliente_fs
from .models import FacturaElectronica, IntentoFactura


class ReintentosTest(FacturacionTestBase):
    def factura(self, estado='RECHAZADA'):
        return FacturaElectronica.objects.create(operacion=self.operacion(), simulada=True,
            estado=estado, email_destino='cliente@test.com', consume_emision=True,
            numero='0000100', numero_completo='001-003-0000100')

    def test_reintento_registra_usuario_sin_rehacer_venta(self):
        anterior = self.factura()
        nueva = servicios.reintentar_factura(anterior, 'nuevo@test.com', 'cajero', 'Ana')
        self.assertEqual(nueva.operacion_id, anterior.operacion_id)
        self.assertEqual(nueva.estado, 'EMITIDA')
        self.assertEqual(nueva.intentos.get().usuario_nombre, 'Ana')
        self.assertEqual(nueva.intentos.get().accion, 'REINTENTO')
        self.assertEqual(servicios.uso()['usadas'], 2)

    def test_conexion_no_consume_y_se_registra(self):
        anterior = self.factura()
        with mock.patch.object(cliente_fs, 'calcular_de', side_effect=cliente_fs.SinRespuesta('offline')):
            nueva = servicios.reintentar_factura(anterior, 'nuevo@test.com', 'cajero', 'Ana')
        self.assertEqual(nueva.estado, 'ERROR')
        self.assertFalse(nueva.consume_emision)
        self.assertEqual(nueva.intentos.count(), 1)
        self.assertEqual(servicios.uso()['usadas'], 1)

    def test_rechazo_servicio_consume(self):
        anterior = self.factura()
        with mock.patch.object(cliente_fs, 'generar_de', side_effect=cliente_fs.ErrorFacturaSegura('rechazo', code=-1)):
            nueva = servicios.reintentar_factura(anterior, 'nuevo@test.com')
        self.assertTrue(nueva.consume_emision)
        self.assertEqual(servicios.uso()['usadas'], 2)

    def test_timeout_generacion_no_consume_pero_no_duplica(self):
        anterior = self.factura()
        with mock.patch.object(cliente_fs, 'generar_de', side_effect=cliente_fs.SinRespuesta('timeout')):
            nueva = servicios.reintentar_factura(anterior, 'nuevo@test.com')
        self.assertFalse(nueva.consume_emision)
        self.assertEqual(nueva.estado, 'VERIFICAR')
        with self.assertRaises(servicios.EmisionRechazada):
            servicios.reintentar_factura(nueva, 'nuevo@test.com')

    @override_settings(FACTURASEGURA=config(desde=100, hasta=200))
    def test_bloqueo_antes_de_50(self):
        anterior = self.factura()
        for _ in range(48):
            FacturaElectronica.objects.create(operacion=anterior.operacion, simulada=True,
                estado='ERROR', email_destino='cliente@test.com', consume_emision=True)
        with mock.patch.object(cliente_fs, 'calcular_de') as calcular:
            with self.assertRaises(servicios.EmisionRechazada):
                servicios.reintentar_factura(anterior, 'cliente@test.com')
            calcular.assert_not_called()
        self.assertEqual(servicios.uso()['limite'], 49)
        self.assertEqual(servicios.uso()['disponibles'], 0)
        self.assertTrue(anterior.intentos.exists())

    def test_reenvio_simulado_no_envia_ni_consume(self):
        factura = self.factura('APROBADA')
        with mock.patch('django.core.mail.EmailMessage.send') as enviar:
            servicios.reenviar_factura(factura, 'nuevo@test.com', 'cajero', 'Ana')
            enviar.assert_not_called()
        self.assertEqual(factura.envio_destinatario, 'nuevo@test.com')
        self.assertEqual(factura.intentos.get().usuario_nombre, 'Ana')
        self.assertEqual(servicios.uso()['usadas'], 1)

    @override_settings(EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend')
    def test_reenvio_real_adjunta_documentos_sin_emitir(self):
        from django.core import mail
        factura = self.factura('APROBADA')
        factura.simulada = False
        factura.cdc = '1' * 44
        factura.save()
        with mock.patch.object(cliente_fs, 'modo_simulado', return_value=False), mock.patch.object(cliente_fs, 'descargar', side_effect=[b'%PDF-test', b'<xml/>']), mock.patch.object(cliente_fs, 'generar_de') as generar:
            servicios.reenviar_factura(factura, 'nuevo@test.com', 'cajero', 'Ana')
            generar.assert_not_called()
        self.assertEqual(mail.outbox[0].to, ['nuevo@test.com'])
        self.assertEqual(len(mail.outbox[0].attachments), 2)

    def test_solo_cajero_reintenta(self):
        factura = self.factura()
        req = self.factory.post('/', {'email': 'nuevo@test.com'}, format='json')
        from rest_framework.test import force_authenticate
        from .views import FacturaElectronicaViewSet
        force_authenticate(req, user=self.user)
        resp = FacturaElectronicaViewSet.as_view({'post': 'reintentar'})(req, pk=factura.pk)
        self.assertEqual(resp.status_code, 403)
