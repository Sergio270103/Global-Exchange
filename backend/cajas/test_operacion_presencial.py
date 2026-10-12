"""Pruebas de la operación cambiaria presencial del cajero (PI-75).

Cubre los criterios de aceptación: exige caja abierta, usa el cliente
seleccionado, aplica la cotización vigente, mueve el saldo de la caja
(solo entra efectivo) y avisa si no hay saldo para entregar.
"""

from decimal import Decimal

from django.core.exceptions import ValidationError as DjangoValidationError
from django.test import TestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from cajas.models import Caja, MovimientoCaja, SaldoCaja, TurnoCaja
from cajas.servicios import CajaCerrada, SaldoInsuficiente
from clientes.models import Cliente, Comision
from comprobantes.models import Comprobante
from cotizaciones.models import Cotizacion
from monedas.models import Moneda
from operaciones.models import Operacion
from pagos.models import MetodoPago

from .views import CajaViewSet


class UsuarioCajero:
    id = 'sub-cajero'
    username = 'Laura'
    nombre = 'Laura'
    roles = ['cashier']
    is_superuser = False

    @property
    def is_authenticated(self):
        return True

    def __str__(self):
        return 'Laura'


class UsuarioComun(UsuarioCajero):
    roles = ['user']


class OperacionPresencialTest(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.pyg, _ = Moneda.objects.get_or_create(
            codigo='PYG', defaults={'nombre': 'Guaraní', 'decimales': 0})
        self.usd, _ = Moneda.objects.get_or_create(
            codigo='USD', defaults={'nombre': 'Dólar', 'decimales': 2})
        Cotizacion.objects.filter(moneda=self.usd).delete()
        # Tasa de prueba: el cliente paga 7500 PYG por cada USD (ajuste 0).
        Cotizacion.objects.create(moneda=self.usd, compra=7000, venta=7500)
        Comision.objects.update_or_create(
            categoria=Cliente.CAT_MINORISTA, defaults={'porcentaje': '0.00'})

        self.caja = Caja.objects.create(nombre='Ventanilla 1', sucursal='Central')
        self.cliente = Cliente.objects.create(
            nombre='Ana', apellido='Barrios', documento='4589201',
            email='ana@x.com', tipo=Cliente.TIPO_FISICA,
        )
        MetodoPago.objects.get_or_create(codigo='efectivo', defaults={'nombre': 'Efectivo'})

    def _abrir_turno(self):
        return TurnoCaja.objects.create(
            caja=self.caja, cajero_id='sub-cajero', cajero_nombre='Laura')

    def _saldo(self, moneda, monto):
        SaldoCaja.objects.update_or_create(
            caja=self.caja, moneda=moneda, defaults={'monto': Decimal(monto)})

    def _cotizar(self, datos=None, usuario=None):
        cuerpo = {'cliente': self.cliente.pk, 'tipo_operacion': 'COMPRA',
                  'moneda': 'USD', 'monto': '100'}
        cuerpo.update(datos or {})
        req = self.factory.post(f'/api/cajas/{self.caja.pk}/cotizar/', cuerpo, format='json')
        force_authenticate(req, user=usuario or UsuarioCajero())
        return CajaViewSet.as_view({'post': 'cotizar'})(req, pk=self.caja.pk)

    def _operar(self, datos=None, usuario=None):
        cuerpo = {'cliente': self.cliente.pk, 'tipo_operacion': 'COMPRA',
                  'moneda': 'USD', 'monto': '100', 'medio_pago': 'efectivo'}
        cuerpo.update(datos or {})
        req = self.factory.post(f'/api/cajas/{self.caja.pk}/operacion/', cuerpo, format='json')
        force_authenticate(req, user=usuario or UsuarioCajero())
        return CajaViewSet.as_view({'post': 'operacion_presencial'})(req, pk=self.caja.pk)

    # --- desglose previo ------------------------------------------------
    def test_el_monto_ingresado_esta_en_la_moneda_del_campo(self):
        """PI-75: escribir 2.000.000 en "Monto (PYG)" son 2M de guaraníes.

        Regresión: el monto se mandaba como si fuera la divisa operada, así
        que 2.000.000 PYG se interpretaban como 2.000.000 USD (15.150
        millones de PYG). El backend tiene que convertirlo.
        """
        self._abrir_turno()
        res = self._cotizar({
            'moneda': 'USD', 'monto': '2000000', 'moneda_del_monto': 'PYG',
            'moneda_contraparte': 'PYG', 'tipo_operacion': 'COMPRA',
        })
        self.assertEqual(res.status_code, 200, res.data)
        # El cliente entrega exactamente lo que escribió.
        self.assertEqual(res.data['cliente_paga'], '2000000 PYG')
        # Y recibe ~266 USD (2.000.000 / 7.500), no 2 millones de dólares.
        recibido = Decimal(res.data['monto_recibido'])
        self.assertGreater(recibido, Decimal('260'))
        self.assertLess(recibido, Decimal('270'))

    def test_el_desglose_cierra_bruto_menos_ajuste_es_neto(self):
        self._abrir_turno()
        res = self._cotizar({
            'moneda': 'USD', 'monto': '2000000', 'moneda_del_monto': 'PYG',
        })
        bruto = Decimal(res.data['monto_bruto'])
        comision = Decimal(res.data['monto_comision'])
        neto = Decimal(res.data['monto_recibido'])
        self.assertEqual(bruto - comision, neto)

    def test_rechaza_venta_de_guaranies(self):
        """El PYG es la moneda base: no se opera como divisa."""
        self._abrir_turno()
        res = self._cotizar({
            'tipo_operacion': 'VENTA', 'moneda': 'PYG', 'monto': '20000',
            'moneda_del_monto': 'PYG', 'moneda_contraparte': 'USD',
        })
        self.assertEqual(res.status_code, 400)
        self.assertIn('guaran', res.data['detail'].lower())

    def test_cotizar_devuelve_desglose_sin_efectos(self):
        self._abrir_turno()
        res = self._cotizar()
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data['cliente_paga'], '750000 PYG')
        self.assertEqual(res.data['cliente_recibe'], '100 USD')
        self.assertEqual(res.data['tasa_aplicada'], '7500.000000')
        self.assertTrue(res.data['caja_abierta'])
        # No crea operación ni mueve nada.
        self.assertFalse(Operacion.objects.exists())
        self.assertFalse(MovimientoCaja.objects.exists())

    def test_cotizar_informa_si_el_saldo_alcanza(self):
        self._abrir_turno()
        self._saldo(self.usd, '50')
        res = self._cotizar()
        self.assertFalse(res.data['saldo_suficiente'])
        self._saldo(self.usd, '500')
        self.assertTrue(self._cotizar().data['saldo_suficiente'])

    def test_cotizar_admite_venta(self):
        self._abrir_turno()
        res = self._cotizar({'tipo_operacion': 'VENTA', 'monto': '100'})
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data['cliente_paga'], '100 USD')
        self.assertEqual(res.data['cliente_recibe'], '700000 PYG')

    # --- ejecución ------------------------------------------------------
    def test_efectivo_mueve_ambos_lados_de_la_caja(self):
        self._abrir_turno()
        self._saldo(self.usd, '1000')
        res = self._operar()
        self.assertEqual(res.status_code, 201, res.data)

        op = Operacion.objects.get()
        self.assertEqual(op.estado, Operacion.ESTADO_PAGADA)
        self.assertEqual(op.cliente_id, self.cliente.pk)
        self.assertEqual(op.usuario_keycloak_id, 'sub-cajero')
        self.assertEqual(op.metodo_pago, 'efectivo')
        # En ventanilla se paga y entrega en el momento: queda PAGADA de una.
        self.assertIsNotNone(op.fecha_confirmacion)
        self.assertIsNotNone(op.fecha_cotizacion)

        # La caja entrega USD y recibe los PYG del cliente.
        self.assertEqual(
            SaldoCaja.objects.get(caja=self.caja, moneda=self.usd).monto, Decimal('900'))
        self.assertEqual(
            SaldoCaja.objects.get(caja=self.caja, moneda=self.pyg).monto, Decimal('750000'))
        tipos = sorted(MovimientoCaja.objects.values_list('tipo', flat=True))
        self.assertEqual(tipos, ['INGRESO', 'RETIRO'])

    def test_tarjeta_solo_registra_la_salida(self):
        self._abrir_turno()
        self._saldo(self.usd, '1000')
        res = self._operar({'medio_pago': 'tarjeta'})
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(MovimientoCaja.objects.count(), 1)
        self.assertEqual(MovimientoCaja.objects.get().tipo, MovimientoCaja.TIPO_RETIRO)
        # La caja no recibe PYG: el pago fue con tarjeta.
        saldo_pyg = SaldoCaja.objects.filter(caja=self.caja, moneda=self.pyg).first()
        self.assertTrue(saldo_pyg is None or saldo_pyg.monto == Decimal('0'))

    def test_transferencia_solo_registra_la_salida(self):
        self._abrir_turno()
        self._saldo(self.usd, '1000')
        res = self._operar({'medio_pago': 'transferencia'})
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(MovimientoCaja.objects.count(), 1)

    def test_venta_debita_la_caja_en_la_divisa_recibida(self):
        self._abrir_turno()
        self._saldo(self.pyg, '1000000')
        res = self._operar({'tipo_operacion': 'VENTA', 'moneda': 'USD',
                            'monto': '100', 'medio_pago': 'efectivo'})
        self.assertEqual(res.status_code, 201, res.data)
        # El cliente da USD y recibe PYG: la caja entra USD y sale PYG.
        tipos = dict(
            (m.tipo, m.total) for m in MovimientoCaja.objects.select_related('moneda'))
        self.assertEqual(MovimientoCaja.objects.filter(tipo=MovimientoCaja.TIPO_INGRESO)
                         .get().moneda_id, self.usd.pk)
        self.assertEqual(MovimientoCaja.objects.filter(tipo=MovimientoCaja.TIPO_RETIRO)
                         .get().moneda_id, self.pyg.pk)

    def test_emite_comprobante_interno_asociado(self):
        self._abrir_turno()
        self._saldo(self.usd, '1000')
        res = self._operar()
        self.assertEqual(res.status_code, 201, res.data)
        op = Operacion.objects.get()
        comp = Comprobante.objects.get(operacion=op)
        self.assertTrue(comp.numero.startswith('CPB-'))
        self.assertEqual(comp.cajero_sub, 'sub-cajero')
        self.assertEqual(comp.cliente_documento, '4589201')
        self.assertEqual(res.data['comprobante']['id'], comp.pk)

    def test_devuelve_el_saldo_actualizado(self):
        self._abierto = self._abrir_turno()
        self._saldo(self.usd, '1000')
        res = self._operar()
        usd = next(m for m in res.data['saldo'] if m['moneda_codigo'] == 'USD')
        pyg = next(m for m in res.data['saldo'] if m['moneda_codigo'] == 'PYG')
        self.assertEqual(usd['total'], '900')
        self.assertEqual(pyg['total'], '750000')

    # --- reglas de negocio ----------------------------------------------
    def test_no_permite_operar_con_la_caja_cerrada(self):
        res = self._operar()
        self.assertEqual(res.status_code, 409)
        self.assertFalse(Operacion.objects.exists())
        self.assertFalse(MovimientoCaja.objects.exists())

    def test_avisa_si_la_caja_no_tiene_saldo_suficiente(self):
        self._abrir_turno()
        self._saldo(self.usd, '10')
        res = self._operar()
        self.assertEqual(res.status_code, 400)
        self.assertIn('insuficiente', res.data['detail'].lower())
        # Nada queda a medias: ni operación, ni movimiento, ni saldo alterado.
        self.assertFalse(Operacion.objects.exists())
        self.assertFalse(MovimientoCaja.objects.exists())
        self.assertEqual(SaldoCaja.objects.get(caja=self.caja, moneda=self.usd).monto,
                         Decimal('10'))

    def test_rechaza_cliente_inactivo(self):
        self._abrir_turno()
        self._saldo(self.usd, '1000')
        self.cliente.activo = False
        self.cliente.save(update_fields=['activo'])
        res = self._operar()
        self.assertEqual(res.status_code, 400)
        self.assertFalse(Operacion.objects.exists())

    def test_rechaza_billetera_como_medio_de_pago(self):
        self._abrir_turno()
        self._saldo(self.usd, '1000')
        res = self._operar({'medio_pago': 'wallet'})
        self.assertEqual(res.status_code, 400)
        self.assertFalse(Operacion.objects.exists())

    def test_rechaza_monto_no_positivo(self):
        self._abrir_turno()
        res = self._cotizar({'monto': '0'})
        self.assertEqual(res.status_code, 400)

    def test_usuario_comun_no_puede_operar(self):
        self._abrir_turno()
        self._saldo(self.usd, '1000')
        res = self._operar(usuario=UsuarioComun())
        self.assertEqual(res.status_code, 403)
        self.assertFalse(Operacion.objects.exists())

    def test_operacion_no_se_puede_editar_ni_borrar(self):
        self._abrir_turno()
        self._saldo(self.usd, '1000')
        self._operar()
        op = Operacion.objects.get()
        # El router de operaciones es de solo lectura para el cajero: no hay
        # verbo de escritura expuesto más allá del create, y el modelo no
        # tiene endpoint de actualización ni borrado en este flujo.
        self.assertEqual(op.estado, Operacion.ESTADO_PAGADA)
        comp = Comprobante.objects.get(operacion=op)
        # El OneToOne protege: una segunda comprobante para la misma
        # operación no se puede crear, así que la foto queda inmutable.
        from django.db import IntegrityError, transaction as db_transaction
        with self.assertRaises(IntegrityError):
            with db_transaction.atomic():
                Comprobante.objects.create(
                    operacion=op, cliente_nombre='x', tipo_operacion='COMPRA',
                    moneda_origen_codigo='PYG', moneda_destino_codigo='USD',
                    monto_enviado=1, monto_recibido=1, fecha_operacion=op.fecha_creacion)

    def test_la_operacion_presencial_solo_expone_post(self):
        """No hay verbo para editar ni borrar la operación presencial."""
        # El método declara solo POST: no hay verbo de edición ni de borrado.
        metodo = CajaViewSet.operacion_presencial
        verbos = set(getattr(metodo, 'mapping', {}))
        self.assertEqual(verbos, {'post'})