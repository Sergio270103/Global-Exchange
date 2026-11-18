"""PI-27: filtros y métodos de pago habilitados."""
from unittest.mock import patch
from .tests import OperacionTests, UsuarioFake
from .test_historial import HistorialTests
from .views import validar_metodo_pago
from pagos.models import MetodoPago
from rest_framework.exceptions import ValidationError


class MetodosDigitalesTests(OperacionTests):
    def test_metodos_invalidos_no_crean_operaciones(self):
        from .models import Operacion
        from rest_framework.test import APIClient
        api = APIClient()
        api.force_authenticate(user=UsuarioFake())
        MetodoPago.objects.filter(codigo='card').update(activo=False)
        for codigo in ['', 'inventado', 'card']:
            with self.subTest(codigo=codigo):
                total = Operacion.objects.count()
                r = api.post('/api/operaciones/', {'cliente': self.cliente.pk,
                    'tipo_operacion': 'COMPRA', 'moneda': 'USD', 'monto_divisa': '100',
                    'metodo_pago': codigo}, format='json')
                self.assertEqual(r.status_code, 400)
                self.assertIn('deshabilitado', str(r.data))
                self.assertEqual(Operacion.objects.count(), total)

    def test_deshabilitado_entre_creacion_y_confirmacion(self):
        from rest_framework.test import APIClient
        from .models import Operacion
        api = APIClient(); api.force_authenticate(user=UsuarioFake())
        for codigo, accion in [('transfer', 'confirmar'), ('card', 'iniciar-pago')]:
            MetodoPago.objects.filter(codigo=codigo).update(activo=True)
            r = api.post('/api/operaciones/', {'cliente': self.cliente.pk,
                'tipo_operacion': 'COMPRA', 'moneda': 'USD', 'monto_divisa': '100',
                'metodo_pago': codigo}, format='json')
            self.assertEqual(r.status_code, 201, r.data)
            MetodoPago.objects.filter(codigo=codigo).update(activo=False)
            with patch('operaciones.views.OperacionViewSet._marcar_confirmada') as confirmar:
                rechazo = api.post(f"/api/operaciones/{r.data['id']}/{accion}/", {}, format='json')
                self.assertEqual(rechazo.status_code, 400)
                self.assertIn('deshabilitado', str(rechazo.data))
                confirmar.assert_not_called()
            self.assertEqual(Operacion.objects.get(pk=r.data['id']).estado, 'PENDIENTE')

    def test_efectivo_solo_cajero(self):
        cajero = UsuarioFake(); cajero.roles = ['cashier']
        validar_metodo_pago('efectivo', cajero)
        with self.assertRaises(ValidationError):
            validar_metodo_pago('efectivo', UsuarioFake())


class FiltrosPagosTests(HistorialTests):
    def test_metodo_estado_cliente_y_seguridad(self):
        from .models import Operacion
        from .test_cancelacion import UsuarioFalso
        Operacion.objects.filter(pk=self.pagada.pk).update(metodo_pago='card')
        Operacion.objects.filter(pk=self.ajena.pk).update(metodo_pago='card')
        url = '/api/operaciones/?metodo=card&estado=PAGADA'
        self.assertEqual(self.ids(url), {self.pagada.pk})
        self.assertEqual(self.ids(url + f'&cliente={self.cliente_beto.pk}'), set())
        admin = UsuarioFalso('admin', 'admin'); admin.roles = ['admin']
        self.api.force_authenticate(user=admin)
        self.assertEqual(self.ids(url), {self.pagada.pk, self.ajena.pk})
        self.assertEqual(self.ids(url + f'&cliente={self.cliente_beto.pk}'), {self.ajena.pk})
