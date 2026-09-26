"""Pruebas unitarias de PI-64: cancelación de transacción por cambio de cotización.

Cubren los criterios de aceptación de la historia:

1. Si la cotización cambia antes de confirmar el pago, el sistema muestra
   la nueva antes de continuar (respetando la ventana de tolerancia).
2. Si el cliente no acepta la nueva cotización, puede cancelar sin costo.
3. La operación cancelada figura en el historial con estado "Cancelada".
4. Queda trazado quién la canceló y en qué momento (auditoría).

Y RF27: la transacción permanece PENDIENTE hasta la confirmación del pago.

Ejecutar desde ``backend/``::

    python manage.py test operaciones.test_cancelacion
"""

from datetime import timedelta
from decimal import Decimal

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from clientes.models import Cliente, ClienteUsuario, Comision
from cotizaciones.models import Cotizacion
from monedas.models import Moneda

from .models import Operacion

SUB_CLIENTE = 'sub-cliente-123'
SUB_AJENO = 'sub-ajeno-999'


class UsuarioFalso:
    """Imita al usuario que arma la autenticación de Keycloak (id = sub)."""

    is_authenticated = True
    is_anonymous = False

    def __init__(self, sub: str, username: str):
        self.id = sub
        self.pk = sub
        self.username = username

    def __str__(self) -> str:
        return self.username


# ----------------------------------------------------------------------
# Datos de prueba. Si algún modelo exige campos que acá no están,
# agregalos en estos helpers (es el único lugar que hay que tocar).
# ----------------------------------------------------------------------
def crear_moneda(codigo: str, nombre: str) -> Moneda:
    """Usa la moneda si ya existe (p. ej. PYG sembrada por una migración)."""
    moneda, _ = Moneda.objects.update_or_create(
        codigo=codigo, defaults={'nombre': nombre, 'activo': True},
    )
    return moneda

def crear_cotizacion(moneda: Moneda, compra: str, venta: str) -> Cotizacion:
    """Crea una tasa y la deja como la más reciente de forma determinista."""
    cot = Cotizacion.objects.create(
        moneda=moneda, compra=Decimal(compra), venta=Decimal(venta), creado_por='tests',
    )
    # `vigente_desde` es auto_now_add: lo corremos para que dos tasas creadas
    # en el mismo instante no empaten al ordenar por fecha.
    total = Cotizacion.objects.filter(moneda=moneda).count()
    Cotizacion.objects.filter(pk=cot.pk).update(
        vigente_desde=timezone.now() + timedelta(seconds=total),
    )
    return cot


@override_settings(OPERACION_TOLERANCIA_SEGUNDOS=30)
class CancelacionPorCotizacionTests(TestCase):

    @classmethod
    def setUpTestData(cls):
        cls.pyg = crear_moneda('PYG', 'Guaraní')
        cls.usd = crear_moneda('USD', 'Dólar Americano')
        crear_cotizacion(cls.usd, '7400', '7500')

        cls.cliente = Cliente.objects.create(
            nombre='Cliente Prueba', activo=True, categoria=Cliente.CAT_MINORISTA,
        )
        ClienteUsuario.objects.create(cliente=cls.cliente, keycloak_id=SUB_CLIENTE)
        # Comisión 0 para que los montos esperados sean fáciles de verificar.
        Comision.objects.update_or_create(
            categoria=Cliente.CAT_MINORISTA, defaults={'porcentaje': Decimal('0')},
        )

    def setUp(self):
        self.api = APIClient()
        self.api.force_authenticate(user=UsuarioFalso(SUB_CLIENTE, 'cliente.prueba'))

    # -------------------------------------------------------------- helpers
    def iniciar_compra(self, monto: str = '100') -> dict:
        r = self.api.post('/api/operaciones/', {
            'cliente': self.cliente.id,
            'tipo_operacion': 'COMPRA',
            'moneda': 'USD',
            'monto_divisa': monto,
            'moneda_contraparte': 'PYG',
            'metodo_pago': 'transfer',
        }, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        return r.data

    def vencer_tolerancia(self, op_id: int):
        Operacion.objects.filter(pk=op_id).update(
            fecha_cotizacion=timezone.now() - timedelta(seconds=60),
        )

    def confirmar(self, op_id: int):
        return self.api.post(f'/api/operaciones/{op_id}/confirmar/', {}, format='json')

    def cancelar(self, op_id: int, motivo: str = 'COTIZACION_CAMBIADA'):
        return self.api.post(
            f'/api/operaciones/{op_id}/cancelar/', {'motivo': motivo}, format='json',
        )

    # ----------------------------------------------------------- RF27
    def test_iniciar_deja_la_operacion_pendiente(self):
        op = self.iniciar_compra()
        self.assertEqual(op['estado'], 'PENDIENTE')
        self.assertGreater(op['segundos_restantes'], 0)
        self.assertEqual(Decimal(op['monto_enviado']), Decimal('750000'))

    # ------------------------------------------------ criterio 1 (tolerancia)
    def test_cambio_de_tasa_dentro_de_tolerancia_respeta_la_tasa_original(self):
        op = self.iniciar_compra()
        crear_cotizacion(self.usd, '7500', '7700')

        r = self.confirmar(op['id'])

        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['resultado'], 'CONFIRMADA')
        self.assertEqual(r.data['operacion']['estado'], 'PAGADA')
        self.assertEqual(Decimal(r.data['operacion']['monto_enviado']), Decimal('750000'))

    def test_sin_cambio_de_tasa_fuera_de_tolerancia_confirma(self):
        op = self.iniciar_compra()
        self.vencer_tolerancia(op['id'])

        r = self.confirmar(op['id'])

        self.assertEqual(r.data['resultado'], 'CONFIRMADA')
        self.assertEqual(Operacion.objects.get(pk=op['id']).estado, 'PAGADA')

    def test_cambio_de_tasa_fuera_de_tolerancia_muestra_la_nueva_antes_de_continuar(self):
        op = self.iniciar_compra()
        self.vencer_tolerancia(op['id'])
        crear_cotizacion(self.usd, '7500', '7700')

        r = self.confirmar(op['id'])

        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['resultado'], 'COTIZACION_CAMBIADA')
        self.assertEqual(Decimal(r.data['anterior']['monto_enviado']), Decimal('750000'))
        self.assertEqual(Decimal(r.data['operacion']['monto_enviado']), Decimal('770000'))
        # No se cobró: sigue pendiente y con una ventana nueva.
        self.assertEqual(r.data['operacion']['estado'], 'PENDIENTE')
        self.assertGreater(r.data['operacion']['segundos_restantes'], 0)

    def test_aceptar_la_nueva_cotizacion_confirma_con_la_tasa_nueva(self):
        op = self.iniciar_compra()
        self.vencer_tolerancia(op['id'])
        crear_cotizacion(self.usd, '7500', '7700')
        self.confirmar(op['id'])  # devuelve COTIZACION_CAMBIADA

        r = self.confirmar(op['id'])  # el usuario acepta

        self.assertEqual(r.data['resultado'], 'CONFIRMADA')
        self.assertEqual(Decimal(r.data['operacion']['monto_enviado']), Decimal('770000'))

    # ------------------------------------------- criterios 2 y 4 (cancelar)
    def test_cancelar_tras_cambio_de_tasa_deja_trazabilidad(self):
        op = self.iniciar_compra()
        self.vencer_tolerancia(op['id'])
        crear_cotizacion(self.usd, '7500', '7700')
        self.confirmar(op['id'])

        antes = timezone.now()
        r = self.cancelar(op['id'])

        self.assertEqual(r.status_code, 200, r.data)
        guardada = Operacion.objects.get(pk=op['id'])
        self.assertEqual(guardada.estado, 'CANCELADA')
        self.assertEqual(guardada.motivo_cancelacion, 'COTIZACION_CAMBIADA')
        self.assertEqual(guardada.cancelada_por, SUB_CLIENTE)
        self.assertEqual(guardada.cancelada_por_nombre, 'cliente.prueba')
        self.assertIsNotNone(guardada.fecha_cancelacion)
        self.assertGreaterEqual(guardada.fecha_cancelacion, antes)
        self.assertIsNone(guardada.fecha_confirmacion)

    def test_cancelar_dos_veces_no_da_error(self):
        op = self.iniciar_compra()
        self.cancelar(op['id'])
        r = self.cancelar(op['id'])
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['estado'], 'CANCELADA')

    def test_no_se_puede_cancelar_una_operacion_pagada(self):
        op = self.iniciar_compra()
        self.confirmar(op['id'])

        r = self.cancelar(op['id'])

        self.assertEqual(r.status_code, 400)
        self.assertEqual(Operacion.objects.get(pk=op['id']).estado, 'PAGADA')

    def test_no_se_puede_confirmar_una_operacion_cancelada(self):
        op = self.iniciar_compra()
        self.cancelar(op['id'])

        r = self.confirmar(op['id'])

        self.assertEqual(r.status_code, 400)
        self.assertEqual(Operacion.objects.get(pk=op['id']).estado, 'CANCELADA')

    def test_un_usuario_no_asociado_no_puede_cancelar(self):
        op = self.iniciar_compra()
        otro = APIClient()
        otro.force_authenticate(user=UsuarioFalso(SUB_AJENO, 'intruso'))

        r = otro.post(f'/api/operaciones/{op["id"]}/cancelar/', {}, format='json')

        self.assertEqual(r.status_code, 400)
        self.assertEqual(Operacion.objects.get(pk=op['id']).estado, 'PENDIENTE')

    # ------------------------------------------------ criterio 3 (historial)
    def test_la_cancelada_figura_en_el_historial(self):
        op = self.iniciar_compra()
        self.cancelar(op['id'])

        r = self.api.get('/api/operaciones/?mine=1')

        self.assertEqual(r.status_code, 200)
        fila = next(o for o in r.data if o['id'] == op['id'])
        self.assertEqual(fila['estado'], 'CANCELADA')

    def test_historial_filtra_por_estado(self):
        cancelada = self.iniciar_compra('50')
        self.cancelar(cancelada['id'])
        pagada = self.iniciar_compra('60')
        self.confirmar(pagada['id'])

        r = self.api.get('/api/operaciones/?mine=1&estado=CANCELADA')

        ids = [o['id'] for o in r.data]
        self.assertIn(cancelada['id'], ids)
        self.assertNotIn(pagada['id'], ids)