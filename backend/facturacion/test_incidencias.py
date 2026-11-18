from decimal import Decimal
from unittest.mock import patch
from django.test import override_settings
from billeteras.models import Billetera, Movimiento
from operaciones.models import Operacion
from . import cliente_fs, servicios
from .models import FacturaElectronica, CorrelativoDocumento
from .test_gestion import GestionBase, config


@override_settings(FACTURASEGURA=config())
class NumeracionTest(GestionBase):
    def ocupado(self, code=-10101, mensaje='NUMDOC_APROBADO'):
        return cliente_fs.ErrorFacturaSegura(mensaje, code=code,
            respuesta={'code': code, 'description': mensaje})

    def test_factura_reintenta_con_correlativos_y_guarda_payload(self):
        op = self.operacion()
        with patch.object(cliente_fs, 'generar_de', side_effect=[self.ocupado(), self.ocupado(), ('01'+'1'*42, {})]) as generar:
            resp = self.emitir(op)
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual([c.args[0]['dNumDoc'] for c in generar.call_args_list], ['0000100','0000101','0000102'])
        factura = FacturaElectronica.objects.get(pk=resp.data['id'])
        self.assertEqual(factura.numero, '0000102')
        self.assertEqual(factura.de_enviado['dNumDoc'], factura.numero)
        self.assertEqual(len(factura.intentos_numeracion), 2)
        self.assertEqual(servicios.siguiente_numero(True), '0000103')

    def test_nc_reintenta_por_descripcion(self):
        factura = self.aprobar_factura()
        with patch.object(cliente_fs, 'generar_de', side_effect=[self.ocupado(-999), ('05'+'1'*42, {})]) as generar:
            resp = self.nota_credito(factura.pk)
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual([c.args[0]['dNumDoc'] for c in generar.call_args_list], ['0000013','0000014'])
        for llamada in generar.call_args_list:
            self.assertEqual(llamada.args[0]['iTiDE'], '5')
            self.assertEqual(llamada.args[0]['gCamDEAsoc'][0]['dCdCDERef'], factura.cdc)

    def test_tope_cinco_facturas_no_reutiliza_numeros_ocupados(self):
        with patch.object(cliente_fs, 'generar_de', side_effect=self.ocupado()) as generar:
            resp = self.emitir(self.operacion())
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(generar.call_count, 5)
        self.assertIn('5 intentos', resp.data['detail'])
        self.assertEqual(servicios.siguiente_numero(True), '0000105')

    def test_tope_cinco_nc(self):
        factura = self.aprobar_factura()
        with patch.object(cliente_fs, 'generar_de', side_effect=self.ocupado()) as generar:
            resp = self.nota_credito(factura.pk)
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(generar.call_count, 5)
        self.assertEqual(servicios.siguiente_numero_nc(True), '0000018')
        factura.refresh_from_db()
        self.assertEqual(factura.estado, 'APROBADA')

    def test_tipo_independiente_aun_con_rango_igual(self):
        cfg = config()
        cfg.update(NC_NUMERO_DESDE=100, NC_NUMERO_HASTA=111)
        with override_settings(FACTURASEGURA=cfg):
            factura = self.aprobar_factura()
            resp = self.nota_credito(factura.pk)
            self.assertEqual(resp.status_code, 201, resp.data)
            self.assertEqual(resp.data['numero'], factura.numero)
            self.assertEqual(set(CorrelativoDocumento.objects.values_list('tipo', flat=True)), {'1','5'})

    def test_series_independientes_y_numeros_repetidos_validos(self):
        self.emitir(self.operacion())
        for campo, valor in (('dEst', '002'), ('dPunExp', '004'), ('dNumTim', '12345678')):
            cfg = config()
            cfg['EMISOR'][campo] = valor
            with self.subTest(campo=campo), override_settings(FACTURASEGURA=cfg):
                resp = self.emitir(self.operacion())
                self.assertEqual(resp.status_code, 201, resp.data)
                self.assertEqual(resp.data['numero'], '0000100')
        self.assertEqual(servicios.siguiente_numero(True), '0000101')

    def test_nc_usa_serie_original_si_cambia_configuracion(self):
        factura = self.aprobar_factura()
        cfg = config()
        cfg['EMISOR']['dPunExp'] = '004'
        with override_settings(FACTURASEGURA=cfg):
            resp = self.nota_credito(factura.pk)
        self.assertEqual(resp.status_code, 201, resp.data)
        nota = factura.notas_credito.get()
        self.assertEqual(nota.punto_expedicion, '003')
        self.assertEqual(nota.de_enviado['dPunExp'], '003')

    def test_timeout_despues_de_colision_no_reenvia_ni_libera(self):
        with patch.object(cliente_fs, 'generar_de', side_effect=[self.ocupado(), cliente_fs.SinRespuesta('timeout')]) as generar:
            resp = self.emitir(self.operacion())
        self.assertEqual(resp.data['estado'], 'VERIFICAR')
        self.assertEqual(resp.data['numero'], '0000101')
        self.assertEqual(generar.call_count, 2)
        self.assertEqual(servicios.siguiente_numero(True), '0000102')

    def test_no_sobrepasa_rango_autorizado(self):
        cfg = config()
        cfg['NUMERO_HASTA'] = 100
        with override_settings(FACTURASEGURA=cfg), patch.object(cliente_fs, 'generar_de', side_effect=self.ocupado()) as generar:
            resp = self.emitir(self.operacion())
            self.assertEqual(resp.status_code, 400)
            self.assertEqual(generar.call_count, 1)
            self.assertIsNone(servicios.siguiente_numero(True))


@override_settings(FACTURASEGURA=config())
class RechazoEmisionTest(GestionBase):
    def preparar(self, tipo='COMPRA'):
        if tipo == 'VENTA':
            Billetera.objects.update_or_create(cliente=self.cliente, moneda=self.usd,
                defaults={'saldo': Decimal('1000')})
        op = self.operacion(tipo=tipo)
        factura = FacturaElectronica.objects.get(pk=self.emitir(op).data['id'])
        origen, _ = Billetera.objects.get_or_create(cliente=op.cliente, moneda=op.moneda_origen)
        origen.saldo = Decimal('50')
        origen.save()
        op.billetera_origen = origen
        op.save()
        return op, factura, origen, op.billetera_destino

    def rechazar(self, factura, estado='Rechazado'):
        with patch.object(cliente_fs, 'get_estado_sifen', return_value=({'estado_sifen': estado}, {})):
            servicios.actualizar_estado(factura)

    def test_compra_y_venta_revierten_una_vez(self):
        for tipo in ('COMPRA', 'VENTA'):
            with self.subTest(tipo=tipo):
                op, factura, origen, destino = self.preparar(tipo)
                saldo_origen, saldo_destino = origen.saldo, destino.saldo
                movimientos = Movimiento.objects.filter(operacion=op).count()
                self.rechazar(factura)
                self.rechazar(FacturaElectronica.objects.get(pk=factura.pk))
                origen.refresh_from_db(); destino.refresh_from_db(); op.refresh_from_db()
                self.assertEqual(origen.saldo, saldo_origen + op.monto_enviado)
                self.assertEqual(destino.saldo, saldo_destino - op.monto_recibido)
                self.assertEqual(Movimiento.objects.filter(operacion=op).count(), movimientos + 2)
                self.assertEqual(op.estado, 'CANCELADA')
                self.assertTrue(op.reversion_emision_aplicada)

    def test_fondos_utilizados_pendiente_sin_asiento_parcial(self):
        op, factura, origen, destino = self.preparar()
        destino.saldo = 0; destino.save()
        movimientos = Movimiento.objects.filter(operacion=op).count()
        self.rechazar(factura)
        op.refresh_from_db(); origen.refresh_from_db(); destino.refresh_from_db()
        self.assertEqual(op.estado, 'CANCELADA')
        self.assertTrue(op.reversion_emision_pendiente)
        self.assertIn('Saldo insuficiente', op.reversion_emision_error)
        self.assertFalse(op.reversion_emision_aplicada)
        self.assertEqual(origen.saldo, 50)
        self.assertEqual(destino.saldo, 0)
        self.assertEqual(Movimiento.objects.filter(operacion=op).count(), movimientos)
        destino.saldo = op.monto_recibido; destino.save()
        self.rechazar(factura)
        op.refresh_from_db()
        self.assertTrue(op.reversion_emision_aplicada)
        self.assertFalse(op.reversion_emision_pendiente)

    def test_estados_transitorios_no_revierten(self):
        op, factura, origen, destino = self.preparar()
        for estado in ('ENVIADO_A_SIFEN', 'ERROR_SIFEN', 'Reingresado'):
            self.rechazar(factura, estado)
        op.refresh_from_db()
        self.assertEqual(op.estado, 'PAGADA')
        self.assertFalse(op.reversion_emision_aplicada)

    def test_sin_billeteras_no_hay_movimientos(self):
        op, factura, _, _ = self.preparar()
        op.billetera_origen = op.billetera_destino = None; op.save()
        n = Movimiento.objects.count()
        self.rechazar(factura)
        op.refresh_from_db()
        self.assertTrue(op.reversion_emision_aplicada)
        self.assertEqual(Movimiento.objects.count(), n)
