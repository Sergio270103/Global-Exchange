from unittest.mock import patch
from xml.etree import ElementTree

from django.test import SimpleTestCase, override_settings
from django.utils import timezone

from billeteras.models import Billetera, Movimiento
from cajas.models import Caja, MovimientoCaja, SaldoCaja, TurnoCaja
from operaciones.models import Operacion
from . import servicios
from .armado import DatosIncompletos, armar_nc_resumido, sanitizar_de
from .models import FacturaElectronica, NotaCreditoElectronica
from .reversion import aplicar_reversion
from .test_gestion import GestionBase, config
from .tests import UsuarioFake


class EscapeXMLTest(SimpleTestCase):
    def test_textos_anidados_se_pueden_incrustar_en_atributos_xml(self):
        texto = 'José "Cambio" & Hijos <local> O\'Brien\nAsunción\t\x00'
        de = {'dNomEmi': texto, 'dNomRec': texto, 'dDirEmi': texto,
              'dInfAdic': texto, 'gCamItem': [{'dDesProSer': texto, 'dCantProSer': 1}],
              'gActEco': [{'dDesActEco': texto}], 'iTiDE': 5, 'dNumDoc': '0000013'}
        limpio = sanitizar_de(de)
        self.assertEqual(limpio, sanitizar_de(limpio))
        self.assertEqual(limpio['iTiDE'], '5')
        self.assertEqual(limpio['dNumDoc'], '0000013')
        def verificar(v):
            if isinstance(v, dict):
                for x in v.values(): verificar(x)
            elif isinstance(v, list):
                for x in v: verificar(x)
            else:
                ElementTree.fromstring(f'<texto valor="{v}"/>')
                self.assertNotIn('\n', v)
                self.assertNotIn('\x00', v)
        verificar(limpio)
        self.assertEqual(de['dNomRec'], texto)

    def test_numeros_mal_formados_se_rechazan(self):
        for v in ('1"', "'5'", 'NaN', '1e6', '1,20', '<5>', '5.1'):
            with self.subTest(v=v), self.assertRaises(DatosIncompletos):
                sanitizar_de({'iTiDE': v})

    def test_no_interpreta_entidades_html_incompletas(self):
        self.assertEqual(sanitizar_de({'dNomRec': 'A &not B'})['dNomRec'], 'A &amp;not B')


@override_settings(FACTURASEGURA=config())
class ReversionTest(GestionBase):
    def setUp(self):
        super().setUp()
        self.admin = UsuarioFake(sub='admin', roles=['admin'])
        self.factura = self.aprobar_factura()
        self.op = self.factura.operacion
        self.op.metodo_pago = 'efectivo'
        self.origen = Billetera.objects.create(cliente=self.cliente,
            moneda=self.op.moneda_origen, saldo=100)
        self.destino, _ = Billetera.objects.update_or_create(cliente=self.cliente,
            moneda=self.op.moneda_destino, defaults={'saldo': self.op.monto_recibido + 20})
        Movimiento.objects.filter(operacion=self.op).delete()  # aislar asientos de reversión
        self.op.billetera_origen = self.origen
        self.op.billetera_destino = self.destino
        self.op.save()
        self.caja = Caja.objects.create(nombre='Ventanilla', sucursal='Central')
        self.turno = TurnoCaja.objects.create(caja=self.caja, cajero_id=self.user.id)
        self.saldo_origen = SaldoCaja.objects.create(caja=self.caja,
            moneda=self.op.moneda_origen, monto=self.op.monto_enviado + 50)
        self.saldo_destino = SaldoCaja.objects.create(caja=self.caja,
            moneda=self.op.moneda_destino, monto=30)

    def solicitar(self, tipo, rol):
        user = self.admin if rol == 'administrador' else self.user
        resp = self.accion(self.factura.pk, 'cancelar' if tipo == 'cancelar' else 'nota_credito',
                           {'contexto_rol': rol}, user=user)
        self.assertIn(resp.status_code, (201, 202), resp.data)
        self.factura.refresh_from_db()
        self.assertEqual(self.factura.estado, 'PROCESANDO')
        self.assertFalse(self.factura.reversion_aplicada)
        self.assertFalse(Movimiento.objects.filter(operacion=self.op).exists())
        self.assertFalse(MovimientoCaja.objects.exists())
        return resp

    def aprobar(self, tipo):
        if tipo == 'cancelar':
            servicios.actualizar_evento(self.factura, 'CANCELACION')
        else:
            servicios.actualizar_estado_nc(self.factura.notas_credito.latest('id'))
        self.factura.refresh_from_db()
        self.op.refresh_from_db()
        self.assertEqual(self.factura.estado, 'ANULADA' if tipo == 'cancelar' else 'DEVUELTA')
        self.assertEqual(self.op.estado, Operacion.ESTADO_CANCELADA)

    def comprobar(self, rol):
        for obj in (self.origen, self.destino, self.saldo_origen, self.saldo_destino):
            obj.refresh_from_db()
        self.assertTrue(self.factura.reversion_aplicada)
        if rol == 'cajero':
            self.assertEqual(self.saldo_origen.monto, 50)
            self.assertEqual(self.saldo_destino.monto, 30 + self.op.monto_recibido)
            self.assertEqual(self.origen.saldo, 100)
            self.assertEqual(self.destino.saldo, self.op.monto_recibido + 20)
            self.assertEqual(MovimientoCaja.objects.count(), 2)
            self.assertEqual(Movimiento.objects.filter(operacion=self.op).count(), 0)
        else:
            self.assertEqual(self.origen.saldo, 100 + self.op.monto_enviado)
            self.assertEqual(self.destino.saldo, 20)
            self.assertEqual(self.saldo_origen.monto, self.op.monto_enviado + 50)
            self.assertEqual(self.saldo_destino.monto, 30)
            self.assertEqual(MovimientoCaja.objects.count(), 0)
            self.assertEqual(Movimiento.objects.filter(operacion=self.op).count(), 2)

    def ciclo(self, tipo, rol):
        self.solicitar(tipo, rol)
        self.aprobar(tipo)
        self.comprobar(rol)
        # Instancias obsoletas y consultas repetidas no duplican el asiento.
        obsoleta = FacturaElectronica.objects.get(pk=self.factura.pk)
        obsoleta.reversion_aplicada = False
        aplicar_reversion(obsoleta, reintento=True)
        self.aprobar(tipo)
        self.comprobar(rol)

    def test_cancelacion_cajero(self): self.ciclo('cancelar', 'cajero')
    def test_nc_cajero(self): self.ciclo('nc', 'cajero')
    def test_cancelacion_admin(self): self.ciclo('cancelar', 'administrador')
    def test_nc_admin(self): self.ciclo('nc', 'administrador')

    def test_caja_sin_saldo_no_hay_movimientos_parciales_y_reintenta(self):
        self.saldo_origen.monto = 0
        self.saldo_origen.save()
        self.solicitar('cancelar', 'cajero')
        self.aprobar('cancelar')
        self.assertTrue(self.factura.reversion_pendiente)
        self.assertIn('Saldo insuficiente', self.factura.reversion_error)
        self.assertFalse(MovimientoCaja.objects.exists())
        self.saldo_origen.monto = self.op.monto_enviado + 50
        self.saldo_origen.save()
        aplicar_reversion(self.factura, reintento=True)
        self.comprobar('cajero')

    def test_billetera_sin_saldo_y_reintento_desde_otro_rol_conserva_admin(self):
        self.destino.saldo = 0
        self.destino.save()
        self.solicitar('nc', 'administrador')
        self.aprobar('nc')
        self.assertTrue(self.factura.reversion_pendiente)
        self.origen.refresh_from_db()
        self.assertEqual(self.origen.saldo, 100)
        self.assertFalse(Movimiento.objects.filter(operacion=self.op).exists())
        self.destino.saldo = self.op.monto_recibido + 20
        self.destino.save()
        resp = self.accion(self.factura.pk, 'reintentar_reversion', {'contexto_rol': 'cajero'})
        self.assertEqual(resp.status_code, 200, resp.data)
        self.factura.refresh_from_db()
        self.comprobar('administrador')

    def test_turno_cerrado_se_conserva_y_reintenta_en_otro_turno(self):
        self.solicitar('cancelar', 'cajero')
        self.turno.cerrado_en = timezone.now()
        self.turno.save()
        self.aprobar('cancelar')
        self.assertTrue(self.factura.reversion_pendiente)
        self.assertFalse(MovimientoCaja.objects.exists())
        nuevo = TurnoCaja.objects.create(caja=self.caja, cajero_id=self.user.id)
        aplicar_reversion(self.factura, reintento=True)
        self.assertEqual(self.factura.reversion_turno_id, nuevo.pk)
        self.assertFalse(MovimientoCaja.objects.filter(turno=self.turno).exists())
        self.comprobar('cajero')

    def test_tarjeta_omite_origen_caja(self):
        self.op.metodo_pago = 'tarjeta'
        self.op.save()
        self.solicitar('cancelar', 'cajero')
        self.aprobar('cancelar')
        self.saldo_origen.refresh_from_db()
        self.assertEqual(self.saldo_origen.monto, self.op.monto_enviado + 50)
        self.assertEqual(MovimientoCaja.objects.count(), 1)

    def test_admin_sin_billeteras_no_mueve_caja(self):
        self.op.billetera_origen = self.op.billetera_destino = None
        self.op.save()
        self.solicitar('nc', 'administrador')
        self.aprobar('nc')
        self.assertTrue(self.factura.reversion_aplicada)
        self.assertFalse(MovimientoCaja.objects.exists())
        self.assertFalse(Movimiento.objects.filter(operacion=self.op).exists())

    def test_historica_no_modifica_saldos(self):
        servicios.finalizar_gestion(self.factura, 'ANULADA', self.factura.cdc)
        aplicar_reversion(self.factura, reintento=True)
        self.assertFalse(self.factura.reversion_aplicada)
        self.assertFalse(MovimientoCaja.objects.exists())
        self.assertFalse(Movimiento.objects.filter(operacion=self.op).exists())

    def test_contexto_no_autorizado_se_rechaza_antes_de_enviar(self):
        with patch('facturacion.cliente_fs.solicitar_cancelacion') as enviar:
            resp = self.accion(self.factura.pk, 'cancelar', {'contexto_rol': 'administrador'})
        self.assertEqual(resp.status_code, 403)
        enviar.assert_not_called()

    def test_doble_rol_usa_contexto_y_admin_por_defecto(self):
        doble = UsuarioFake(roles=['admin', 'cashier'])
        resp = self.accion(self.factura.pk, 'cancelar', user=doble)
        self.assertEqual(resp.status_code, 202)
        self.factura.refresh_from_db()
        self.assertEqual(self.factura.gestion_rol, 'administrador')

    def test_cancelar_nunca_genera_nc(self):
        with patch('facturacion.cliente_fs.generar_de') as generar, patch(
                'facturacion.cliente_fs.solicitar_cancelacion', return_value={'code': 0, 'results': []}) as cancelar:
            self.solicitar('cancelar', 'cajero')
        generar.assert_not_called()
        cancelar.assert_called_once_with(self.factura.cdc, config()['EMISOR']['dRucEm'])
        self.assertTrue(self.factura.cdc.startswith('01'))
        self.assertFalse(NotaCreditoElectronica.objects.exists())

    def test_rechazo_o_error_sifen_nc_no_revierte(self):
        self.solicitar('nc', 'administrador')
        nota = self.factura.notas_credito.get()
        for estado in ('ERROR_SIFEN', 'ENVIADO_A_SIFEN', 'Rechazado'):
            with patch('facturacion.cliente_fs.get_estado_sifen', return_value=({'estado_sifen': estado}, {})):
                servicios.actualizar_estado_nc(nota)
            self.factura.refresh_from_db()
            self.assertFalse(self.factura.reversion_aplicada)
            self.assertFalse(Movimiento.objects.filter(operacion=self.op).exists())

    def test_payload_nc_sanitiza_datos_historicos_y_conserva_cdc(self):
        self.factura.de_enviado['dNomRec'] = 'Cliente "A&B" <test>'
        de = armar_nc_resumido(self.factura, '0000013', 'nc@test.com', '5')
        self.assertEqual(de['iTiDE'], '5')
        self.assertEqual(de['gCamDEAsoc'][0]['dCdCDERef'], self.factura.cdc)
        self.assertIn('&quot;', de['dNomRec'])
        self.assertIn('&amp;', de['dNomRec'])

    def test_aprobacion_original_no_confirma_cancelacion(self):
        self.solicitar('cancelar', 'administrador')
        with patch('facturacion.cliente_fs.get_estado_sifen', return_value=(
                {'estado_sifen': 'Aprobado', 'estado_can': 'ENVIADO_A_SIFEN'}, {})):
            servicios.actualizar_evento(self.factura, 'CANCELACION')
        self.factura.refresh_from_db()
        self.op.refresh_from_db()
        self.assertEqual(self.factura.estado, 'PROCESANDO')
        self.assertEqual(self.op.estado, Operacion.ESTADO_PAGADA)
        self.assertFalse(self.factura.reversion_aplicada)

    def test_error_cancelacion_sigue_pendiente_y_rechazo_no_revierte(self):
        self.solicitar('cancelar', 'administrador')
        for estado in ('ERROR_SIFEN', 'Rechazado'):
            with patch('facturacion.cliente_fs.get_estado_sifen', return_value=(
                    {'estado_can': estado}, {})):
                servicios.actualizar_evento(self.factura, 'CANCELACION')
            self.factura.refresh_from_db()
            self.assertFalse(self.factura.reversion_aplicada)
        self.assertEqual(self.factura.estado, 'APROBADA')
        self.assertFalse(Movimiento.objects.filter(operacion=self.op).exists())

    def test_reintento_antes_de_aprobar_rechazado(self):
        self.solicitar('nc', 'administrador')
        resp = self.accion(self.factura.pk, 'reintentar_reversion')
        self.assertEqual(resp.status_code, 400)
        self.assertFalse(Movimiento.objects.filter(operacion=self.op).exists())

    def test_doble_rol_contexto_cajero_explicito(self):
        doble = UsuarioFake(roles=['admin', 'cashier'])
        resp = self.accion(self.factura.pk, 'cancelar', {'contexto_rol': 'cajero'}, user=doble)
        self.assertEqual(resp.status_code, 202)
        self.aprobar('cancelar')
        self.comprobar('cajero')

    def test_no_nc_mientras_cancelacion_pendiente(self):
        self.solicitar('cancelar', 'administrador')
        with patch('facturacion.cliente_fs.generar_de') as generar:
            resp = self.accion(self.factura.pk, 'nota_credito', user=self.admin)
        self.assertEqual(resp.status_code, 400)
        generar.assert_not_called()

    def test_fallo_segundo_movimiento_revierte_primero(self):
        self.solicitar('cancelar', 'cajero')
        from django.core.exceptions import ValidationError
        from cajas.servicios import registrar_movimiento
        def registrar(**kwargs):
            if kwargs['tipo'] == MovimientoCaja.TIPO_INGRESO:
                raise ValidationError('No se pudo acreditar el destino.')
            return registrar_movimiento(**kwargs)
        with patch('facturacion.reversion.registrar_movimiento', side_effect=registrar):
            self.aprobar('cancelar')
        self.saldo_origen.refresh_from_db()
        self.assertEqual(self.saldo_origen.monto, self.op.monto_enviado + 50)
        self.assertFalse(MovimientoCaja.objects.exists())
        self.assertTrue(self.factura.reversion_pendiente)

    def test_pdf_fallido_no_revierte_aprobacion_y_reintenta_descarga(self):
        self.solicitar('cancelar', 'administrador')
        self.factura.simulada = False
        self.factura.save(update_fields=['simulada'])
        from .cliente_fs import SinRespuesta
        with patch('facturacion.cliente_fs.descargar', side_effect=SinRespuesta('timeout')):
            servicios.finalizar_gestion(self.factura, 'ANULADA', self.factura.cdc)
        self.assertEqual(self.factura.estado, 'ANULADA')
        self.assertTrue(self.factura.reversion_aplicada)
        self.assertTrue(self.factura.pdf_pendiente)
        import tempfile
        from pathlib import Path
        with tempfile.TemporaryDirectory() as carpeta, patch(
                'facturacion.servicios.ruta_pdf', return_value=Path(carpeta) / 'factura.pdf'), patch(
                'facturacion.cliente_fs.descargar', return_value=b'%PDF-1.4\nactualizado') as descargar:
            servicios.actualizar_pdf(self.factura)
            self.assertEqual((Path(carpeta) / 'factura.pdf').read_bytes(), b'%PDF-1.4\nactualizado')
            descargar.assert_called_once_with('dwn_kude', config()['EMISOR']['dRucEm'], self.factura.cdc)
        self.assertFalse(self.factura.pdf_pendiente)

    def test_cliente_http_sanitiza_antes_y_despues_de_calcular(self):
        from . import cliente_fs
        de = armar_nc_resumido(self.factura, '0000013', 'nc@test.com', '5')
        de['dNomRec'] = 'Nombre "A&B"'
        with override_settings(FACTURASEGURA=config('real')), patch(
                'facturacion.cliente_fs._llamar', side_effect=[
                    {'results': [{'DE': de}]}, {'results': [{'CDC': '05' + '0' * 42}]}]) as llamar:
            calculado = cliente_fs.calcular_de(de)
            cliente_fs.generar_de(calculado)
        for llamada in llamar.call_args_list:
            enviado = llamada.args[1]['DE']
            self.assertEqual(enviado['dNomRec'], 'Nombre &quot;A&amp;B&quot;')
            self.assertEqual(enviado['iTiDE'], '5')

    def test_transferencia_omite_origen_caja(self):
        self.op.metodo_pago = 'transferencia'
        self.op.save()
        self.solicitar('nc', 'cajero')
        self.aprobar('nc')
        self.saldo_origen.refresh_from_db()
        self.assertEqual(self.saldo_origen.monto, self.op.monto_enviado + 50)
        self.assertEqual(MovimientoCaja.objects.count(), 1)

    def test_admin_revierte_solo_lado_billetera(self):
        self.op.billetera_origen = None
        self.op.save()
        self.solicitar('cancelar', 'administrador')
        self.aprobar('cancelar')
        self.origen.refresh_from_db()
        self.destino.refresh_from_db()
        self.assertEqual(self.origen.saldo, 100)
        self.assertEqual(self.destino.saldo, 20)
        self.assertEqual(Movimiento.objects.filter(operacion=self.op).count(), 1)
        self.assertFalse(MovimientoCaja.objects.exists())

    def test_comprobante_interno_no_elude_confirmacion_fiscal(self):
        from comprobantes.views import ComprobanteViewSet
        from rest_framework.test import force_authenticate
        req = self.factory.post('/api/comprobantes/', {'operacion': self.op.pk}, format='json')
        force_authenticate(req, user=self.user)
        creada = ComprobanteViewSet.as_view({'post': 'create'})(req)
        self.assertEqual(creada.status_code, 201, creada.data)
        req = self.factory.post('/api/comprobantes/anular/', {}, format='json')
        force_authenticate(req, user=self.user)
        resp = ComprobanteViewSet.as_view({'post': 'anular'})(req, pk=creada.data['id'])
        self.assertEqual(resp.status_code, 400, resp.data)
        self.assertIn('SIFEN', resp.data['detail'])
        self.assertFalse(MovimientoCaja.objects.exists())
