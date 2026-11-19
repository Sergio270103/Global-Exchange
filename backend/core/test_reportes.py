from datetime import datetime, timezone as tz
from decimal import Decimal
from unittest.mock import patch, MagicMock
from django.test import TestCase
from rest_framework.test import APIClient
from clientes.models import Cliente, ClienteUsuario
from monedas.models import Moneda
from monedas.autenticacion import UsuarioKeycloak
from operaciones.models import Operacion
from facturacion.models import FacturaElectronica, HistorialFactura
from .reportes_keycloak import usuarios_habilitados, KeycloakNoDisponible


class ReportesTests(TestCase):
    def setUp(self):
        self.api = APIClient()
        self.api.force_authenticate(user=UsuarioKeycloak({'sub': 'admin', 'realm_access': {'roles': ['admin']}}))
        self.cliente = Cliente.objects.create(nombre='José', apellido='Pérez', documento='00123-4', email='jose@example.com')
        self.pyg, _ = Moneda.objects.get_or_create(codigo='PYG', defaults={'nombre': 'Guaraní'})
        self.usd, _ = Moneda.objects.get_or_create(codigo='USD', defaults={'nombre': 'Dólar'})
        ClienteUsuario.objects.create(cliente=self.cliente, keycloak_id='operador', username='operador')

    def operacion(self, **datos):
        valores = dict(cliente=self.cliente, usuario_keycloak_id='operador', tipo_operacion='VENTA',
            moneda_origen=self.usd, moneda_destino=self.pyg, monto_enviado=100, monto_recibido=740000,
            cotizacion_aplicada=7400, monto_comision=10000, porcentaje_comision_aplicado=1,
            estado='PAGADA', fecha_confirmacion=datetime(2026, 10, 20, 12, tzinfo=tz.utc))
        valores.update(datos)
        return Operacion.objects.create(**valores)

    def test_columnas_y_filtros_transacciones_clientes(self):
        op = self.operacion()
        self.operacion(estado='PENDIENTE', fecha_confirmacion=None)
        resp = self.api.get('/api/reportes/transacciones/', {'estado': 'PAGADA'})
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data['columnas']), 16)
        self.assertEqual(resp.data['columnas'][10], 'Tasa')
        self.assertEqual(len(resp.data['filas']), 1)
        self.assertEqual(resp.data['filas'][0][:4], [op.pk, resp.data['filas'][0][1], 'José Pérez', 'operador'])
        self.assertEqual(self.api.get('/api/reportes/clientes/').status_code, 400)
        resp = self.api.get('/api/reportes/clientes/', {'cliente': self.cliente.pk})
        self.assertEqual(len(resp.data['filas']), 2)
        self.assertTrue(any('00123-4' in n for n in resp.data['notas']))
        self.assertEqual(self.api.get('/api/reportes/transacciones/', {'desde': '2026-12-01', 'hasta': '2026-01-01'}).status_code, 400)
        self.assertEqual(self.api.get('/api/reportes/transacciones/', {'estado': 'INVALIDO'}).status_code, 400)

    def test_busqueda_cliente_por_nombre_completo_documento_y_correo(self):
        for texto in ['José Pérez', '00123-4', 'jose@example.com', 'Pérez']:
            resp = self.api.get('/api/clientes/', {'buscar': texto})
            self.assertEqual(resp.status_code, 200)
            self.assertEqual([c['id'] for c in resp.data], [self.cliente.pk])
        self.assertEqual(self.api.get('/api/clientes/', {'buscar': 'sin-coincidencias'}).data, [])

    def test_comision_cobrada_octubre_y_debito_noviembre_sin_restar_capital(self):
        self.operacion(estado='CANCELADA', fecha_cancelacion=datetime(2026, 11, 10, 12, tzinfo=tz.utc), motivo_cancelacion='ANULADA')
        self.operacion(estado='CANCELADA', fecha_confirmacion=None, fecha_cancelacion=datetime(2026, 11, 10, 12, tzinfo=tz.utc))
        for mes, esperado in [('10', [Decimal(10000), Decimal(0), Decimal(10000)]), ('11', [Decimal(0), Decimal(10000), Decimal(-10000)])]:
            resp = self.api.get('/api/reportes/ganancias/', {'desde': f'2026-{mes}-01', 'hasta': f'2026-{mes}-30'})
            self.assertEqual(resp.status_code, 200)
            self.assertEqual(resp.data['filas'], [['PYG', *esperado]])
        self.assertEqual(self.api.get('/api/reportes/ganancias/').data['filas'][0][3], 0)

    def test_historial_fiscal_inmutable_y_sin_pendientes_ni_simuladas(self):
        f = FacturaElectronica.objects.create(operacion=self.operacion(), simulada=False, estado='EMITIDA', total=1000, email_destino='jose@example.com')
        self.assertFalse(HistorialFactura.objects.exists())
        with patch('facturacion.historial.timezone.now', return_value=datetime(2026, 10, 20, 12, tzinfo=tz.utc)):
            f.estado = 'APROBADA'; f.save()
        f.estado = 'PROCESANDO'; f.save()
        self.cliente.nombre = 'Nombre modificado'; self.cliente.save()
        with patch('facturacion.historial.timezone.now', return_value=datetime(2026, 11, 10, 12, tzinfo=tz.utc)):
            f.estado = 'DEVUELTA'; f.save()
        f.save()  # consultar o reenviar no duplica el resultado fiscal
        self.assertEqual(HistorialFactura.objects.count(), 2)
        filas = self.api.get('/api/reportes/facturas/').data['filas']
        self.assertEqual([fila[7] for fila in filas], ['PAGADA', 'ANULADA'])
        self.assertEqual(filas[0][2], 'José Pérez')
        self.assertNotEqual(filas[0][8], filas[1][8])
        filtrado = self.api.get('/api/reportes/facturas/', {'desde': '2026-11-01', 'hasta': '2026-11-30'})
        self.assertEqual([f[7] for f in filtrado.data['filas']], ['ANULADA'])
        FacturaElectronica.objects.create(operacion=self.operacion(), simulada=True, estado='APROBADA', total=1000, email_destino='jose@example.com')
        self.assertEqual(HistorialFactura.objects.count(), 2)

    def test_rechazada_y_cancelada_tienen_etiquetas_correctas(self):
        for interno, esperado in [('RECHAZADA', 'RECHAZADA'), ('ANULADA', 'CANCELADA')]:
            f = FacturaElectronica.objects.create(operacion=self.operacion(), estado=interno, email_destino='jose@example.com')
            self.assertEqual(f.historial_reporte.get().estado, esperado)

    def test_reportes_exclusivos_administrador(self):
        for rol in ['user', 'cashier', 'analyst']:
            self.api.force_authenticate(user=UsuarioKeycloak({'sub': rol, 'realm_access': {'roles': [rol]}}))
            for tipo in ['transacciones', 'ganancias', 'clientes', 'facturas', 'accesos']:
                self.assertEqual(self.api.get(f'/api/reportes/{tipo}/').status_code, 403)

    @patch('core.reportes_keycloak.requests.Session')
    def test_keycloak_filtra_habilitados_y_roles_realm_y_cliente(self, session):
        sesion = session.return_value.__enter__.return_value
        sesion.headers = {}
        respuestas = [
            [{'id': 'frontend'}],
            [{'id': 'a', 'enabled': True, 'username': 'ana', 'firstName': 'Ana'},
             {'id': 'b', 'enabled': False}, {'id': 's', 'enabled': True, 'serviceAccountClientId': 'servicio'},
             {'id': 'c', 'enabled': True, 'username': 'otro'}],
            [], [{'name': 'admin'}], [{'name': 'offline_access'}], [],
        ]
        sesion.get.side_effect = [MagicMock(json=MagicMock(return_value=r)) for r in respuestas]
        req = MagicMock(headers={'Authorization': 'Bearer test'})
        self.assertEqual(usuarios_habilitados(req), [['Ana', 'ana', '', 'admin']])
        self.assertEqual(sesion.headers['Authorization'], 'Bearer test')

    @patch('core.reportes_keycloak.requests.Session')
    def test_keycloak_error_no_devuelve_listado_parcial(self, session):
        import requests
        session.return_value.__enter__.return_value.get.side_effect = requests.Timeout()
        with self.assertRaises(KeycloakNoDisponible):
            usuarios_habilitados(MagicMock(headers={}))
