"""Pruebas de gestión SIFEN: anulación, inutilización y notas de crédito.

Igual que PI-30, ninguna prueba sale a la red: el modo simulado no usa
``requests`` y el modo real se reemplaza con mocks.
"""

from decimal import Decimal
from unittest import mock

import requests
from django.test import override_settings
from rest_framework.test import force_authenticate

from clientes.models import ClienteUsuario

from .models import EventoSIFEN, FacturaElectronica, NotaCreditoElectronica
from .tests import (
    EMISOR,
    FacturacionTestBase,
    UsuarioFake,
    config as config_base,
    ok,
    respuesta_http,
    sin_red,
)
from .views import FacturaElectronicaViewSet, NotaCreditoElectronicaViewSet


def config(modo='simulado'):
    datos = config_base(modo=modo)
    datos.update({
        'NC_NUMERO_DESDE': 13,
        'NC_NUMERO_HASTA': 24,
        'CANCELACION_VENTANA_HORAS': 0,
        'LOGIN_URL': 'https://fs.invalid/login?include_auth_token',
    })
    return datos


class GestionBase(FacturacionTestBase):
    def setUp(self):
        super().setUp()
        # El cajero emisor es quien puede gestionar sus facturas.
        self.user = UsuarioFake(roles=['cashier'])
        self.otro = UsuarioFake(sub='sub-otro', username='otro', roles=['cashier'])
        # Otro cajero que ve al mismo cliente, pero no emitió la factura.
        ClienteUsuario.objects.create(
            cliente=self.cliente, keycloak_id='sub-otro', username='otro')

    def aprobar_factura(self):
        factura_id = self.emitir(self.operacion()).data['id']
        resp = self.consultar_estado(factura_id)
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['estado'], 'APROBADA', resp.data)
        return FacturaElectronica.objects.get(pk=factura_id)

    def factura_rechazada(self, cdc='2' * 44):
        op = self.operacion()
        return FacturaElectronica.objects.create(
            operacion=op, simulada=True, numero='0000100',
            numero_completo='001-003-0000100', cdc=cdc,
            estado=FacturaElectronica.ESTADO_RECHAZADA,
            total=Decimal('1000'), email_destino='cliente@test.com',
            emitida_por_sub='sub-123', emitida_por_nombre='tester',
        )

    def accion(self, factura_id, nombre, datos=None, user=None):
        req = self.factory.post(
            f'/api/facturas/{factura_id}/{nombre}/', datos or {}, format='json')
        force_authenticate(req, user=user or self.user)
        return FacturaElectronicaViewSet.as_view({'post': nombre})(req, pk=factura_id)

    def cancelar(self, factura_id, motivo='', user=None):
        return self.accion(factura_id, 'cancelar', {'motivo': motivo}, user)

    def consultar_cancelacion(self, factura_id, user=None):
        req = self.factory.post(
            f'/api/facturas/{factura_id}/cancelacion/estado/', {}, format='json')
        force_authenticate(req, user=user or self.user)
        return FacturaElectronicaViewSet.as_view(
            {'post': 'cancelacion_estado'})(req, pk=factura_id)

    def inutilizar(self, factura_id, motivo='', user=None):
        return self.accion(factura_id, 'inutilizar', {'motivo': motivo}, user)

    def consultar_inutilizacion(self, factura_id, user=None):
        req = self.factory.post(
            f'/api/facturas/{factura_id}/inutilizacion/estado/', {}, format='json')
        force_authenticate(req, user=user or self.user)
        return FacturaElectronicaViewSet.as_view(
            {'post': 'inutilizacion_estado'})(req, pk=factura_id)

    def nota_credito(self, factura_id, motivo='5', email='', user=None):
        req = self.factory.post(
            f'/api/facturas/{factura_id}/nota-credito/',
            {'motivo': motivo, 'email': email}, format='json')
        force_authenticate(req, user=user or self.user)
        return FacturaElectronicaViewSet.as_view(
            {'post': 'nota_credito'})(req, pk=factura_id)

    def consultar_nc(self, nota_id, user=None):
        req = self.factory.post(
            f'/api/notas-credito/{nota_id}/estado/', {}, format='json')
        force_authenticate(req, user=user or self.user)
        return NotaCreditoElectronicaViewSet.as_view(
            {'post': 'estado'})(req, pk=nota_id)


@sin_red
@override_settings(FACTURASEGURA=config())
class GestionSimuladaTest(GestionBase):
    def test_anula_factura_aprobada_y_consulta_el_evento(self, _red):
        factura = self.aprobar_factura()
        resp = self.cancelar(factura.pk, 'El cliente desistió.')
        self.assertEqual(resp.status_code, 202, resp.data)
        self.assertEqual(resp.data['evento']['estado'], 'PENDIENTE')
        self.assertEqual(resp.data['factura']['estado_cancelacion'], 'PENDIENTE')
        self.assertEqual(resp.data['evento']['motivo'], 'El cliente desistió.')

        resp = self.consultar_cancelacion(factura.pk)
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['evento']['estado'], 'APROBADA')
        factura.refresh_from_db()
        self.assertEqual(factura.estado_cancelacion, 'APROBADA')
        self.assertEqual(factura.estado, 'ANULADA')
        self.assertIn('Cancelado', factura.detalle)
        self.assertIsNotNone(factura.cancelacion_consultada)

    def test_no_anula_una_factura_no_aprobada(self, _red):
        factura_id = self.emitir(self.operacion()).data['id']
        resp = self.cancelar(factura_id)
        self.assertEqual(resp.status_code, 400)
        self.assertIn('aprobada', resp.data['detail'])
        self.assertFalse(EventoSIFEN.objects.exists())

    def test_no_permite_dos_cancelaciones(self, _red):
        factura = self.aprobar_factura()
        self.assertEqual(self.cancelar(factura.pk).status_code, 202)
        resp = self.cancelar(factura.pk)
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(EventoSIFEN.objects.count(), 1)

    def test_solo_el_cajero_emisor_o_admin_pueden_anular(self, _red):
        factura = self.aprobar_factura()
        # Ve la factura por su cliente, pero no la emitió.
        resp = self.cancelar(factura.pk, user=self.otro)
        self.assertEqual(resp.status_code, 403, resp.data)
        admin = UsuarioFake(sub='sub-admin', username='admin', roles=['admin'])
        self.assertEqual(self.cancelar(factura.pk, user=admin).status_code, 202)

    def test_inutiliza_un_numero_rechazado(self, _red):
        factura = self.factura_rechazada()
        resp = self.inutilizar(factura.pk, 'Número rechazado por SIFEN.')
        self.assertEqual(resp.status_code, 202, resp.data)
        self.assertEqual(resp.data['evento']['estado'], 'PENDIENTE')
        self.assertEqual(resp.data['evento']['cdc_evento'], factura.cdc)
        self.assertEqual(resp.data['factura']['estado_inutilizacion'], 'PENDIENTE')

        resp = self.consultar_inutilizacion(factura.pk)
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['evento']['estado'], 'APROBADA')
        factura.refresh_from_db()
        self.assertEqual(factura.estado_inutilizacion, 'APROBADA')
        self.assertIn('Inutilizado', factura.detalle)

    def test_no_inutiliza_una_factura_aprobada(self, _red):
        factura = self.aprobar_factura()
        resp = self.inutilizar(factura.pk)
        self.assertEqual(resp.status_code, 400)
        self.assertIn('aprobada', resp.data['detail'])

    def test_no_inutiliza_sin_numero(self, _red):
        factura = self.factura_rechazada()
        factura.numero = None
        factura.save(update_fields=['numero'])
        resp = self.inutilizar(factura.pk)
        self.assertEqual(resp.status_code, 400)
        self.assertIn('número', resp.data['detail'])

    def test_emite_nota_credito_total(self, _red):
        factura = self.aprobar_factura()
        resp = self.nota_credito(
            factura.pk, motivo='5', email='nc@test.com')
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data['estado'], 'EMITIDA')
        self.assertEqual(resp.data['numero'], '0000013')
        self.assertEqual(resp.data['numero_completo'], '001-003-0000013')
        self.assertEqual(resp.data['motivo'], '5')
        self.assertEqual(Decimal(resp.data['total']), factura.total)
        self.assertEqual(len(resp.data['cdc']), 44)
        self.assertEqual(resp.data['email_destino'], 'cliente@test.com')

        nota = NotaCreditoElectronica.objects.get(pk=resp.data['id'])
        de = nota.de_enviado
        self.assertEqual(de['iTiDE'], '5')
        self.assertEqual(de['iMotEmi'], '5')
        self.assertEqual(de['gCamDEAsoc'][0]['dCdCDERef'], factura.cdc)
        self.assertEqual(de['iTipTra'], factura.de_enviado['iTipTra'])
        self.assertEqual(de['gCamItem'][0]['dPUniProSer'], str(factura.total))

        resp = self.consultar_nc(nota.pk)
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['estado'], 'APROBADA')
        self.assertEqual(resp.data['envio_destinatario'], 'cliente@test.com')

        uso = self.ver_uso(factura.operacion).data
        self.assertEqual(uso['nc_usadas'], 1)
        self.assertEqual(uso['nc_limite'], 12)
        self.assertEqual(uso['nc_siguiente_numero'], '0000014')

    def test_una_sola_nc_activa_por_factura(self, _red):
        factura = self.aprobar_factura()
        self.assertEqual(self.nota_credito(factura.pk).status_code, 201)
        resp = self.nota_credito(factura.pk)
        self.assertEqual(resp.status_code, 400)
        self.assertIn('nota de crédito activa', resp.data['detail'])

    def test_no_emite_nc_de_factura_no_aprobada(self, _red):
        factura_id = self.emitir(self.operacion()).data['id']
        resp = self.nota_credito(factura_id)
        self.assertEqual(resp.status_code, 400)
        self.assertIn('aprobada', resp.data['detail'])

    def test_no_emite_nc_de_factura_cancelada(self, _red):
        factura = self.aprobar_factura()
        self.cancelar(factura.pk)
        self.consultar_cancelacion(factura.pk)
        resp = self.nota_credito(factura.pk)
        self.assertEqual(resp.status_code, 400)
        self.assertIn('aprobada', resp.data['detail'])

    def test_lista_notas_credito(self, _red):
        factura = self.aprobar_factura()
        self.nota_credito(factura.pk)
        req = self.factory.get('/api/notas-credito/')
        force_authenticate(req, user=self.user)
        resp = NotaCreditoElectronicaViewSet.as_view({'get': 'list'})(req)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 1)
        self.assertEqual(resp.data[0]['factura'], factura.pk)

    def test_usuario_sin_rol_no_puede_gestionar(self, _red):
        factura = self.aprobar_factura()
        usuario = UsuarioFake(sub='sub-123', username='tester', roles=())
        self.assertEqual(self.cancelar(factura.pk, user=usuario).status_code, 403)
        self.assertEqual(self.nota_credito(factura.pk, user=usuario).status_code, 403)


@sin_red
@override_settings(FACTURASEGURA=config(modo='real'))
class GestionRealMockeadaTest(GestionBase):
    def _mock_factura(self, red, *, cancelacion_code=0, estado_can='Aprobado',
                      estado_inu='', cdc='1' * 44):
        def responder(url, json, headers, timeout):
            operacion = json['operation']
            if operacion == 'calcular_de':
                return ok([{'DE': json['params']['DE']}])
            if operacion == 'generar_de':
                return ok([{'CDC': cdc}])
            if operacion == 'sol_cancelacion':
                if cancelacion_code < 0:
                    return respuesta_http({
                        'code': cancelacion_code,
                        'description': 'Ya pasó el plazo de cancelación',
                        'operation_info': {'id': 'x'}, 'results': []})
                return ok([])
            if operacion == 'sol_inutilizacion':
                return ok([{'CDC': '9' * 44}])
            if operacion == 'get_estado_sifen':
                return ok([{
                    'estado_sifen': 'Aprobado', 'desc_sifen': 'Aprobado',
                    'error_sifen': '', 'fch_sifen': '',
                    'estado_can': estado_can, 'desc_can': 'Cancelación',
                    'error_can': '', 'fch_can': '',
                    'estado_inu': estado_inu, 'desc_inu': 'Inutilización',
                    'error_inu': '', 'fch_inu': '',
                }])
            raise AssertionError(f'Operación inesperada: {operacion}')
        red.side_effect = responder

    def test_cancela_con_token_y_parametros_del_manual(self, red):
        self._mock_factura(red)
        factura = self.aprobar_factura()
        resp = self.cancelar(factura.pk, 'Devolución')
        self.assertEqual(resp.status_code, 202, resp.data)
        llamada = next(
            c for c in red.call_args_list
            if c.kwargs['json']['operation'] == 'sol_cancelacion')
        self.assertEqual(llamada.kwargs['json']['params'], {
            'CDC': factura.cdc, 'dRucEm': '2595733'})
        self.assertEqual(
            llamada.kwargs['headers']['Authentication-Token'], 'token-de-prueba')

        resp = self.consultar_cancelacion(factura.pk)
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['evento']['estado'], 'APROBADA')

    def test_error_de_cancelacion_queda_en_error(self, red):
        self._mock_factura(red, cancelacion_code=-10321)
        factura = self.aprobar_factura()
        resp = self.cancelar(factura.pk)
        self.assertEqual(resp.status_code, 400, resp.data)
        self.assertIn('plazo', resp.data['detail'])
        self.assertEqual(resp.data['evento']['estado'], 'ERROR')
        factura.refresh_from_db()
        self.assertEqual(factura.estado_cancelacion, 'ERROR')

    def test_timeout_de_cancelacion_no_reintenta(self, red):
        self._mock_factura(red)
        factura = self.aprobar_factura()

        def fallar(url, json, headers, timeout):
            if json['operation'] == 'sol_cancelacion':
                raise requests.Timeout('timeout')
            return red.side_effect(url, json, headers, timeout)
        red.side_effect = fallar
        resp = self.cancelar(factura.pk)
        self.assertEqual(resp.status_code, 202, resp.data)
        self.assertEqual(resp.data['evento']['estado'], 'PENDIENTE')
        self.assertIn('No se reintenta', resp.data['evento']['detalle'])
        factura.refresh_from_db()
        self.assertEqual(factura.estado_cancelacion, 'PENDIENTE')

    def test_inutiliza_y_guarda_el_cdc_ficticio(self, red):
        self._mock_factura(red, estado_inu='Aprobado')
        factura = self.factura_rechazada()
        factura.simulada = False
        factura.save(update_fields=['simulada'])
        resp = self.inutilizar(factura.pk)
        self.assertEqual(resp.status_code, 202, resp.data)
        self.assertEqual(resp.data['evento']['cdc_evento'], '9' * 44)
        llamada = next(
            c for c in red.call_args_list
            if c.kwargs['json']['operation'] == 'sol_inutilizacion')
        self.assertEqual(llamada.kwargs['json']['params'], {
            'dRucEm': '2595733', 'iTiDE': '1', 'dNumTim': '02595733',
            'dEst': '001', 'dPunExp': '003', 'dNumDoc': '0000100'})

        resp = self.consultar_inutilizacion(factura.pk)
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['evento']['estado'], 'APROBADA')
        factura.refresh_from_db()
        self.assertEqual(factura.estado_inutilizacion, 'APROBADA')
        self.assertIn('Inutilizado', factura.detalle)

    def test_nc_real_envia_itide_5_y_referencia(self, red):
        self._mock_factura(red)
        factura = self.aprobar_factura()
        resp = self.nota_credito(factura.pk, motivo='7', email='nc@test.com')
        self.assertEqual(resp.status_code, 201, resp.data)
        nota = NotaCreditoElectronica.objects.get(pk=resp.data['id'])
        generar = [
            c for c in red.call_args_list
            if c.kwargs['json']['operation'] == 'generar_de'
            and c.kwargs['json']['params']['DE']['iTiDE'] == '5']
        self.assertEqual(len(generar), 1)
        de = generar[0].kwargs['json']['params']['DE']
        self.assertEqual(de['iMotEmi'], '5')
        self.assertEqual(de['gCamDEAsoc'][0]['dCdCDERef'], factura.cdc)
        self.assertEqual(nota.numero, '0000013')

        resp = self.consultar_nc(nota.pk)
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['estado'], 'APROBADA')

    def test_error_de_nc_libera_el_numero(self, red):
        def responder(url, json, headers, timeout):
            if json['operation'] == 'calcular_de':
                return ok([{'DE': json['params']['DE']}])
            if (json['operation'] == 'generar_de'
                    and json['params']['DE']['iTiDE'] == '5'):
                return respuesta_http({
                    'code': -10001, 'description': 'iMotEmi inválido',
                    'operation_info': {'id': 'x'}, 'results': []})
            if json['operation'] == 'generar_de':
                return ok([{'CDC': '1' * 44}])
            return ok([{'estado_sifen': 'Aprobado'}])
        red.side_effect = responder
        factura = self.aprobar_factura()
        resp = self.nota_credito(factura.pk, motivo='5')
        self.assertEqual(resp.status_code, 400, resp.data)
        self.assertIn('iMotEmi', resp.data['detail'])
        nota = NotaCreditoElectronica.objects.get()
        self.assertEqual(nota.estado, 'ERROR')
        self.assertIsNone(nota.numero)
        self.assertEqual(self.ver_uso(factura.operacion).data['nc_siguiente_numero'],
                         '0000013')

    def test_timeout_de_nc_queda_verificar(self, red):
        def responder(url, json, headers, timeout):
            if json['operation'] == 'calcular_de':
                return ok([{'DE': json['params']['DE']}])
            if (json['operation'] == 'generar_de'
                    and json['params']['DE']['iTiDE'] == '5'):
                raise requests.Timeout('timeout')
            if json['operation'] == 'generar_de':
                return ok([{'CDC': '1' * 44}])
            return ok([{'estado_sifen': 'Aprobado'}])
        red.side_effect = responder
        factura = self.aprobar_factura()
        resp = self.nota_credito(factura.pk)
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data['estado'], 'VERIFICAR')
        self.assertEqual(resp.data['numero'], '0000013')
        # Otra NC queda bloqueada porque el número pudo haberse consumido.
        self.assertEqual(self.nota_credito(factura.pk).status_code, 400)

    def test_descarga_kude_y_xml_de_nc(self, red):
        self._mock_factura(red)
        factura = self.aprobar_factura()
        nota_id = self.nota_credito(factura.pk).data['id']
        self.consultar_nc(nota_id)

        with mock.patch('facturacion.cliente_fs.requests.get') as get:
            pdf = mock.Mock(status_code=200, content=b'%PDF-1.4 NC')
            pdf.json.return_value = {}
            get.return_value = pdf
            req = self.factory.get(f'/api/notas-credito/{nota_id}/kude/')
            force_authenticate(req, user=self.user)
            resp = NotaCreditoElectronicaViewSet.as_view(
                {'get': 'kude'})(req, pk=nota_id)
            self.assertEqual(resp.status_code, 200)
            self.assertEqual(resp['Content-Type'], 'application/pdf')
            self.assertIn('001-003-0000013.pdf', resp['Content-Disposition'])

            xml = mock.Mock(status_code=200, content=b'<rDE/>')
            xml.json.return_value = {}
            get.return_value = xml
            req = self.factory.get(f'/api/notas-credito/{nota_id}/xml/')
            force_authenticate(req, user=self.user)
            resp = NotaCreditoElectronicaViewSet.as_view(
                {'get': 'xml'})(req, pk=nota_id)
            self.assertEqual(resp.status_code, 200)
            self.assertEqual(resp['Content-Type'], 'application/xml')

    def test_estado_aplica_precedencia_inutilizacion_cancelacion(self, red):
        self._mock_factura(red, estado_can='Aprobado', estado_inu='Aprobado')
        factura = self.aprobar_factura()
        EventoSIFEN.objects.create(
            factura=factura, tipo=EventoSIFEN.TIPO_CANCELACION,
            estado=EventoSIFEN.ESTADO_PENDIENTE, cdc_evento=factura.cdc)
        EventoSIFEN.objects.create(
            factura=factura, tipo=EventoSIFEN.TIPO_INUTILIZACION,
            estado=EventoSIFEN.ESTADO_PENDIENTE, cdc_evento=factura.cdc)
        factura.estado_cancelacion = 'PENDIENTE'
        factura.estado_inutilizacion = 'PENDIENTE'
        factura.save()
        resp = self.consultar_estado(factura.pk)
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['estado_cancelacion'], 'APROBADA')
        self.assertEqual(resp.data['estado_inutilizacion'], 'APROBADA')
        self.assertTrue(resp.data['detalle'].startswith('Inutilizado'))


class RecuperacionPdfTest(GestionBase):
    @override_settings(FACTURASEGURA=config())
    def test_pdf_fallido_se_recupera_sin_perder_estado(self):
        import tempfile
        from . import servicios, cliente_fs
        factura = self.aprobar_factura()
        factura.simulada = False
        factura.save()
        with tempfile.TemporaryDirectory() as carpeta, override_settings(MEDIA_ROOT=carpeta):
            ruta = servicios.ruta_pdf(factura)
            ruta.parent.mkdir(parents=True)
            ruta.write_bytes(b'%PDF-anterior')
            with mock.patch.object(cliente_fs, 'descargar', side_effect=cliente_fs.SinRespuesta('timeout')):
                servicios.finalizar_gestion(factura, 'DEVUELTA', '9' * 44)
            factura.refresh_from_db()
            self.assertEqual(factura.estado, 'DEVUELTA')
            self.assertTrue(factura.pdf_pendiente)
            with mock.patch.object(cliente_fs, 'descargar', return_value=b'%PDF-nuevo') as descarga:
                servicios.sincronizar_gestion(factura)
            self.assertFalse(factura.pdf_pendiente)
            self.assertEqual(ruta.read_bytes(), b'%PDF-nuevo')
            self.assertEqual(descarga.call_args.args[2], '9' * 44)
