"""Pruebas de facturación electrónica (PI-30).

Ninguna prueba llama a Factura Segura: el modo simulado no usa la red y
en el modo real se reemplaza ``requests.post`` por un mock. Así los tests
nunca gastan números del rango asignado.
"""

from decimal import Decimal
from unittest import mock

import requests
from django.test import override_settings
from rest_framework.test import APIRequestFactory, APITestCase, force_authenticate

from clientes.models import Cliente, ClienteUsuario, Comision
from cotizaciones.models import Cotizacion
from monedas.models import Moneda
from operaciones.models import Operacion
from operaciones.views import OperacionViewSet

from .armado import armar_de_resumido
from .models import FacturaElectronica
from .views import FacturaElectronicaViewSet

EMISOR = {
    'dRucEm': '2595733', 'dDVEmi': '3', 'iTipCont': '1',
    'dNumTim': '02595733', 'dFeIniT': '2025-03-27',
    'dEst': '001', 'dPunExp': '003', 'dNomEmi': 'EMISOR DE PRUEBA',
    'dDirEmi': 'CALLE 1', 'dNumCas': '123', 'cDepEmi': '1',
    'dDesDepEmi': 'CAPITAL', 'cCiuEmi': '1', 'dDesCiuEmi': 'ASUNCION (DISTRITO)',
    'dTelEmi': '(021)5887000', 'dEmailE': 'emisor@test.com',
    'cActEco': '66120', 'dDesActEco': 'Actividades de cambio',
}


def config(modo='simulado', desde=100, hasta=111, emisor=None):
    return {
        'MODO': modo, 'URL': 'https://fs.invalid/misife00/v1/esi',
        'TOKEN': 'token-de-prueba', 'TIMEOUT': 5,
        'NUMERO_DESDE': desde, 'NUMERO_HASTA': hasta, 'IVA_TASA': 10,
        'EMISOR': dict(EMISOR if emisor is None else emisor),
    }


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


def respuesta_http(datos, status=200):
    resp = mock.Mock()
    resp.status_code = status
    resp.json.return_value = datos
    resp.text = str(datos)
    return resp


def ok(results):
    return respuesta_http({
        'code': 0, 'description': 'OK',
        'operation_info': {'id': 'abc'}, 'results': results})


#: Red de seguridad: si algún test llegara a usar la red, falla.
sin_red = mock.patch(
    'facturacion.cliente_fs.requests.post',
    side_effect=AssertionError('Prohibido llamar a la red en tests'))


@override_settings(FACTURASEGURA=config())
class FacturacionTestBase(APITestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.user = UsuarioFake()
        self.otro = UsuarioFake(sub='sub-otro')
        self.usd, _ = Moneda.objects.get_or_create(
            codigo='USD', defaults={'nombre': 'Dólar', 'decimales': 2})
        Moneda.objects.get_or_create(
            codigo='PYG', defaults={'nombre': 'Guaraní', 'decimales': 0})
        Cotizacion.objects.create(
            moneda=self.usd, compra=Decimal('7400'), venta=Decimal('7500'))
        self.cliente = Cliente.objects.create(
            nombre='Cliente', apellido='Test', documento='4567890',
            email='cliente@test.com', categoria=Cliente.CAT_MINORISTA)
        Comision.objects.update_or_create(
            categoria=Cliente.CAT_MINORISTA,
            defaults={'porcentaje': Decimal('1.00')})
        ClienteUsuario.objects.create(
            cliente=self.cliente, keycloak_id='sub-123', username='tester')

    def operacion(self, pagar=True, tipo='COMPRA'):
        datos = {'cliente': self.cliente.pk, 'tipo_operacion': tipo,
                 'moneda': 'USD', 'monto_divisa': '100', 'metodo_pago': ''}
        req = self.factory.post('/api/operaciones/', datos, format='json')
        force_authenticate(req, user=self.user)
        resp = OperacionViewSet.as_view({'post': 'create'})(req)
        self.assertEqual(resp.status_code, 201, resp.data)
        op = Operacion.objects.get(pk=resp.data['id'])
        if pagar:
            req = self.factory.post(
                f'/api/operaciones/{op.pk}/confirmar/', {}, format='json')
            force_authenticate(req, user=self.user)
            resp = OperacionViewSet.as_view({'post': 'confirmar'})(req, pk=op.pk)
            self.assertEqual(resp.data['resultado'], 'CONFIRMADA', resp.data)
        return Operacion.objects.get(pk=op.pk)

    def emitir(self, op, email='cliente@test.com', user=None):
        req = self.factory.post(
            '/api/facturas/', {'operacion': op.pk, 'email': email}, format='json')
        force_authenticate(req, user=user or self.user)
        return FacturaElectronicaViewSet.as_view({'post': 'create'})(req)

    def consultar_estado(self, factura_id):
        req = self.factory.post(f'/api/facturas/{factura_id}/estado/', {}, format='json')
        force_authenticate(req, user=self.user)
        return FacturaElectronicaViewSet.as_view({'post': 'estado'})(req, pk=factura_id)

    def ver_uso(self, op):
        req = self.factory.get(f'/api/facturas/uso/?operacion={op.pk}')
        force_authenticate(req, user=self.user)
        return FacturaElectronicaViewSet.as_view({'get': 'uso'})(req)


@sin_red
class EmisionSimuladaTest(FacturacionTestBase):
    def test_emite_operacion_pagada(self, _red):
        resp = self.emitir(self.operacion())
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data['estado'], 'EMITIDA')
        self.assertEqual(resp.data['numero'], '0000100')
        self.assertEqual(resp.data['numero_completo'], '001-003-0000100')
        self.assertEqual(len(resp.data['cdc']), 44)
        self.assertTrue(resp.data['simulada'])
        # Se factura el total en PYG: en una compra, lo que paga el cliente.
        op = Operacion.objects.get(pk=resp.data['operacion'])
        self.assertEqual(Decimal(resp.data['total']), op.monto_enviado.quantize(Decimal('1')))

    def test_no_emite_pendiente_ni_cancelada(self, _red):
        resp = self.emitir(self.operacion(pagar=False))
        self.assertEqual(resp.status_code, 400)
        self.assertIn('PAGADA', resp.data['detail'])
        self.assertFalse(FacturaElectronica.objects.exists())

    def test_no_emite_dos_veces_la_misma_operacion(self, _red):
        op = self.operacion()
        self.assertEqual(self.emitir(op).status_code, 201)
        resp = self.emitir(op)
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(FacturaElectronica.objects.count(), 1)

    def test_email_invalido(self, _red):
        resp = self.emitir(self.operacion(), email='no-es-correo')
        self.assertEqual(resp.status_code, 400)

    def test_otro_usuario_no_puede_facturar(self, _red):
        resp = self.emitir(self.operacion(), user=self.otro)
        self.assertEqual(resp.status_code, 403)

    @override_settings(FACTURASEGURA=config(desde=100, hasta=101))
    def test_limite_de_emisiones(self, _red):
        self.assertEqual(self.emitir(self.operacion()).status_code, 201)
        self.assertEqual(self.emitir(self.operacion()).status_code, 201)
        resp = self.emitir(self.operacion())
        self.assertEqual(resp.status_code, 400)
        self.assertIn('2 de 2', resp.data['detail'])

    def test_uso_y_email_precargado(self, _red):
        op = self.operacion()
        resp = self.ver_uso(op)
        self.assertEqual(resp.data['usadas'], 0)
        self.assertEqual(resp.data['limite'], 12)
        self.assertEqual(resp.data['email_cliente'], 'cliente@test.com')
        self.assertIsNone(resp.data['factura'])
        self.emitir(op)
        resp = self.ver_uso(op)
        self.assertEqual(resp.data['usadas'], 1)
        self.assertEqual(resp.data['factura']['numero'], '0000100')

    def test_estado_aprobada_registra_envio(self, _red):
        factura_id = self.emitir(self.operacion()).data['id']
        resp = self.consultar_estado(factura_id)
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['estado'], 'APROBADA')
        self.assertEqual(resp.data['envio_destinatario'], 'cliente@test.com')
        self.assertIsNotNone(resp.data['envio_fecha'])
        self.assertIn('Simulado', resp.data['envio_resultado'])

    def test_venta_factura_lo_que_recibe_en_pyg(self, _red):
        from billeteras.models import Billetera
        Billetera.objects.update_or_create(
            cliente=self.cliente, moneda=self.usd, defaults={'saldo': Decimal('500')})
        op = self.operacion(tipo='VENTA')
        resp = self.emitir(op)
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(Decimal(resp.data['total']), op.monto_recibido.quantize(Decimal('1')))
        item = FacturaElectronica.objects.get().de_enviado['gCamItem'][0]
        self.assertEqual(item['dDesProSer'], f'Operación de venta de USD - OP-{op.pk}')

    def test_receptor_con_cedula_y_con_ruc(self, _red):
        op = self.operacion()
        de = armar_de_resumido(op, '0000100', 'cliente@test.com')
        self.assertEqual(de['iNatRec'], '2')
        self.assertEqual(de['dNumIDRec'], '4567890')
        self.cliente.documento = '80012345-6'
        self.cliente.tipo = Cliente.TIPO_JURIDICA
        self.cliente.save()
        op.refresh_from_db()
        de = armar_de_resumido(op, '0000100', 'cliente@test.com')
        self.assertEqual(de['iNatRec'], '1')
        self.assertEqual((de['dRucRec'], de['dDVRec'], de['iTiContRec']),
                         ('80012345', '6', '2'))
        self.assertEqual(de['dNumDoc'], '0000100')
        self.assertEqual(de['dPunExp'], '003')


@sin_red
@override_settings(FACTURASEGURA=config(modo='real'))
class EmisionRealMockeadaTest(FacturacionTestBase):
    """Modo real con ``requests.post`` reemplazado: nunca sale a la red."""

    def test_calcula_y_genera_con_token(self, red):
        cdc = '0' * 44
        red.side_effect = lambda url, json, headers, timeout: (
            ok([{'DE': {**json['params']['DE'], 'dTotGralOpe': '1'}}])
            if json['operation'] == 'calcular_de' else ok([{'CDC': cdc}]))
        resp = self.emitir(self.operacion())
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data['estado'], 'EMITIDA')
        self.assertEqual(resp.data['cdc'], cdc)
        self.assertFalse(resp.data['simulada'])
        operaciones = [c.kwargs['json']['operation'] for c in red.call_args_list]
        self.assertEqual(operaciones, ['calcular_de', 'generar_de'])
        llamada = red.call_args_list[1].kwargs
        self.assertEqual(llamada['headers']['Authentication-Token'], 'token-de-prueba')
        self.assertEqual(llamada['json']['params']['DE']['dNumDoc'], '0000100')

    def test_error_de_generar_libera_el_numero(self, red):
        red.side_effect = lambda url, json, headers, timeout: (
            ok([{'DE': json['params']['DE']}])
            if json['operation'] == 'calcular_de'
            else respuesta_http({
                'code': -10001, 'description': 'El valor del campo iTiOpe no es permitido',
                'operation_info': {'id': 'x'}, 'results': []}))
        op = self.operacion()
        resp = self.emitir(op)
        self.assertEqual(resp.status_code, 400)
        self.assertIn('iTiOpe', resp.data['detail'])
        factura = FacturaElectronica.objects.get()
        self.assertEqual(factura.estado, 'ERROR')
        self.assertIsNone(factura.numero)
        self.assertEqual(factura.respuesta_servicio['code'], -10001)
        # El número 0000100 sigue libre y la operación se puede reintentar.
        self.assertEqual(self.ver_uso(op).data['siguiente_numero'], '0000100')

    def test_error_de_calcular_no_gasta_nada(self, red):
        red.side_effect = None
        red.return_value = respuesta_http({
            'code': -10001, 'description': 'Campo inválido',
            'operation_info': {'id': 'x'}, 'results': []})
        resp = self.emitir(self.operacion())
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(red.call_count, 1)  # nunca llegó a generar_de
        self.assertIsNone(FacturaElectronica.objects.get().numero)

    def test_timeout_en_generar_no_reintenta(self, red):
        def responder(url, json, headers, timeout):
            if json['operation'] == 'calcular_de':
                return ok([{'DE': json['params']['DE']}])
            raise requests.Timeout('timeout')
        red.side_effect = responder
        op = self.operacion()
        resp = self.emitir(op)
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data['estado'], 'VERIFICAR')
        self.assertEqual(resp.data['numero'], '0000100')
        self.assertIn('NO reintentar', resp.data['detalle'])
        # Bloquea otra emisión de la misma operación y el número cuenta.
        self.assertEqual(self.emitir(op).status_code, 400)
        self.assertEqual(self.ver_uso(op).data['usadas'], 1)
        self.assertEqual(red.call_count, 2)

    def test_rechazo_sifen_permite_reemitir(self, red):
        def responder(url, json, headers, timeout):
            if json['operation'] == 'calcular_de':
                return ok([{'DE': json['params']['DE']}])
            if json['operation'] == 'generar_de':
                return ok([{'CDC': '1' * 44}])
            return ok([{
                'estado_sifen': 'Rechazado', 'desc_sifen': '1001 - Rechazado',
                'error_sifen': 'RUC del receptor inexistente'}])
        red.side_effect = responder
        op = self.operacion()
        factura_id = self.emitir(op).data['id']
        resp = self.consultar_estado(factura_id)
        self.assertEqual(resp.data['estado'], 'RECHAZADA')
        self.assertIn('RUC del receptor', resp.data['detalle'])
        segunda = self.emitir(op)
        self.assertEqual(segunda.status_code, 201)
        self.assertEqual(segunda.data['numero'], '0000101')

    @override_settings(FACTURASEGURA=config(modo='real', emisor={'dRucEm': '2595733'}))
    def test_faltan_datos_del_emisor_no_llama_a_la_api(self, red):
        resp = self.emitir(self.operacion())
        self.assertEqual(resp.status_code, 400)
        self.assertIn('Faltan datos del emisor', resp.data['detail'])
        red.assert_not_called()
        self.assertFalse(FacturaElectronica.objects.exists())
