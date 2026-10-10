"""Tests del endpoint de resumen para el dashboard admin.

``GET /api/operaciones/resumen/`` agrega solo operaciones PAGADA:
volumen bruto en PYG, conteo compra/venta y ganancias por comisión
(convertidas a PYG con la última cotización de venta vigente).
"""

from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from clientes.models import Cliente, ClienteUsuario, Comision
from cotizaciones.models import Cotizacion
from monedas.models import Moneda

from .models import Operacion
from .views import OperacionViewSet


class UsuarioComun:
    id = 'sub-comun'
    username = 'comun'
    is_authenticated = True
    is_superuser = False
    roles = []


class UsuarioAdmin:
    id = 'sub-admin'
    username = 'admin'
    is_authenticated = True
    is_superuser = True
    roles = ['admin']


def _get_como(vista, usuario, **kwargs):
    factory = APIRequestFactory()
    req = factory.get('/api/operaciones/resumen/')
    force_authenticate(req, user=usuario)
    return vista(req, **kwargs)


class ResumenTests(TestCase):
    def setUp(self):
        self.pyg, _ = Moneda.objects.get_or_create(
            codigo='PYG', defaults={'nombre': 'Guaraní', 'decimales': 0},
        )
        self.usd, _ = Moneda.objects.get_or_create(
            codigo='USD', defaults={'nombre': 'Dólar', 'decimales': 2},
        )
        Cotizacion.objects.create(
            moneda=self.usd, compra=Decimal('7400'), venta=Decimal('7500'),
        )
        self.cliente = Cliente.objects.create(
            nombre='Cliente Test', documento='123', email='c@test.com',
            categoria=Cliente.CAT_MINORISTA,
        )
        Comision.objects.update_or_create(
            categoria=Cliente.CAT_MINORISTA,
            defaults={'porcentaje': Decimal('1.00')},
        )
        ClienteUsuario.objects.create(
            cliente=self.cliente, keycloak_id='sub-comun', username='comun',
        )

    def _operacion(self, tipo, origen, destino, enviado, recibido, comision,
                   estado=Operacion.ESTADO_PAGADA):
        return Operacion.objects.create(
            cliente=self.cliente, usuario_keycloak_id='sub-comun',
            tipo_operacion=tipo, moneda_origen=origen, moneda_destino=destino,
            monto_enviado=Decimal(str(enviado)),
            monto_recibido=Decimal(str(recibido)),
            cotizacion_aplicada=Decimal('1'),
            porcentaje_comision_aplicado=Decimal('1'),
            monto_comision=Decimal(str(comision)),
            estado=estado,
        )

    def test_no_admin_403(self):
        vista = OperacionViewSet.as_view({'get': 'resumen'})
        res = _get_como(vista, UsuarioComun())
        self.assertEqual(res.status_code, 403)

    def test_vacio_en_ceros(self):
        vista = OperacionViewSet.as_view({'get': 'resumen'})
        res = _get_como(vista, UsuarioAdmin())
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data['total_operaciones'], 0)
        self.assertEqual(res.data['volumen_total_pyg'], 0)
        self.assertEqual(res.data['ganancias_pyg'], 0)
        self.assertEqual(res.data['comisiones_por_moneda'], [])

    def test_agrega_solo_pagada(self):
        # COMPRA 100 USD: paga 757.500 PYG, recibe 100 USD, comisión 1 USD.
        self._operacion('COMPRA', self.pyg, self.usd, 757500, 100, 1)
        # VENTA 100 USD: entrega 100 USD, recibe 732.600 PYG, comisión 7.400 PYG.
        self._operacion('VENTA', self.usd, self.pyg, 100, 732600, 7400)
        # PENDIENTE no debe contar.
        self._operacion('COMPRA', self.pyg, self.usd, 75750, 10, Decimal('0.1'),
                        estado=Operacion.ESTADO_PENDIENTE)

        vista = OperacionViewSet.as_view({'get': 'resumen'})
        res = _get_como(vista, UsuarioAdmin())
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data['total_operaciones'], 2)
        self.assertEqual(res.data['compras'], 1)
        self.assertEqual(res.data['ventas'], 1)
        # Volumen: 101 USD * 7500 + (732.600 + 7.400) PYG = 1.497.500.
        self.assertEqual(res.data['volumen_total_pyg'], 1497500)
        # Ganancias: 1 USD * 7500 + 7.400 PYG = 14.900.
        self.assertEqual(res.data['ganancias_pyg'], 14900)
        por_moneda = {c['moneda']: c for c in res.data['comisiones_por_moneda']}
        self.assertEqual(por_moneda['USD']['total'], 1)
        self.assertEqual(por_moneda['USD']['equivalente_pyg'], 7500)
        self.assertEqual(por_moneda['PYG']['total'], 7400)
        self.assertEqual(res.data['operaciones_sin_tasa'], 0)

    def test_sin_cotizacion_cuenta_pero_no_suma_pyg(self):
        Cotizacion.objects.all().delete()
        eur, _ = Moneda.objects.get_or_create(
            codigo='EUR', defaults={'nombre': 'Euro', 'decimales': 2},
        )
        self._operacion('COMPRA', self.pyg, eur, 830000, 100, 1)

        vista = OperacionViewSet.as_view({'get': 'resumen'})
        res = _get_como(vista, UsuarioAdmin())
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data['total_operaciones'], 1)
        self.assertEqual(res.data['volumen_total_pyg'], 0)
        self.assertEqual(res.data['operaciones_sin_tasa'], 1)
