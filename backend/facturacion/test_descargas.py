"""Descarga del KuDE (PDF) y del XML oficiales (PI-86, dwn_kude/dwn_xml).

``requests.get`` se reemplaza por un mock: no se usa la red ni se gasta
ningún número (descargar tampoco consume números en la API real).
"""

from unittest import mock

from django.test import override_settings
from rest_framework.test import force_authenticate

from .models import FacturaElectronica
from .tests import FacturacionTestBase, config, sin_red
from .views import FacturaElectronicaViewSet

CDC = '0' * 44


def http(status=200, contenido=b'', datos=None):
    resp = mock.Mock()
    resp.status_code = status
    resp.content = contenido
    resp.json.side_effect = (lambda: datos) if datos is not None else ValueError
    return resp


@sin_red
@override_settings(FACTURASEGURA=config(modo='real'))
class DescargasTest(FacturacionTestBase):
    def factura(self, **extra):
        datos = {
            'operacion': self.operacion(), 'simulada': False, 'numero': '0000100',
            'numero_completo': '001-003-0000100', 'cdc': CDC,
            'estado': FacturaElectronica.ESTADO_APROBADA,
            'email_destino': 'cliente@test.com',
        }
        datos.update(extra)
        return FacturaElectronica.objects.create(**datos)

    def bajar(self, factura, que='kude', user=None):
        req = self.factory.get(f'/api/facturas/{factura.pk}/{que}/')
        force_authenticate(req, user=user or self.user)
        return FacturaElectronicaViewSet.as_view({'get': que})(req, pk=factura.pk)

    @mock.patch('facturacion.cliente_fs.requests.get')
    def test_descarga_el_kude_oficial(self, get, _red):
        get.return_value = http(contenido=b'%PDF-1.4 kude')
        resp = self.bajar(self.factura())
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp['Content-Type'], 'application/pdf')
        self.assertIn('001-003-0000100.pdf', resp['Content-Disposition'])
        self.assertEqual(resp.content, b'%PDF-1.4 kude')
        url = get.call_args.args[0]
        self.assertTrue(url.endswith(f'/dwn_kude/2595733/{CDC}'), url)
        self.assertEqual(get.call_args.kwargs['headers']['Authentication-Token'],
                         'token-de-prueba')

    @mock.patch('facturacion.cliente_fs.requests.get')
    def test_descarga_el_xml(self, get, _red):
        get.return_value = http(contenido=b'<?xml version="1.0"?><rDE/>')
        resp = self.bajar(self.factura(), que='xml')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp['Content-Type'], 'application/xml')
        self.assertTrue(get.call_args.args[0].endswith(f'/dwn_xml/2595733/{CDC}'))

    @mock.patch('facturacion.cliente_fs.requests.get')
    def test_solo_aprobadas_y_reales(self, get, _red):
        rechazada = self.factura(estado=FacturaElectronica.ESTADO_RECHAZADA)
        self.assertEqual(self.bajar(rechazada).status_code, 400)
        simulada = self.factura(simulada=True, numero='0000101')
        self.assertEqual(self.bajar(simulada).status_code, 400)
        get.assert_not_called()

    @mock.patch('facturacion.cliente_fs.requests.get')
    def test_error_de_factura_segura(self, get, _red):
        get.return_value = http(datos={'code': -80006, 'description': 'CDC inexistente'})
        resp = self.bajar(self.factura())
        self.assertEqual(resp.status_code, 400)
        self.assertIn('CDC inexistente', resp.data['detail'])

    @mock.patch('facturacion.cliente_fs.requests.get')
    def test_otro_usuario_no_la_ve(self, get, _red):
        resp = self.bajar(self.factura(), user=self.otro)
        self.assertEqual(resp.status_code, 404)
        get.assert_not_called()
