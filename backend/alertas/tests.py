"""Pruebas del módulo de alertas de tasas (PI-38, RF45/RNF27)."""

from rest_framework.test import APIRequestFactory, APITestCase, force_authenticate

from cotizaciones.models import Cotizacion
from cotizaciones.views import CotizacionViewSet
from monedas.models import Moneda

from .models import AlertaTasa, DisparoAlerta
from .servicios import evaluar_alertas
from .views import AlertaTasaViewSet


class UsuarioFake:
    def __init__(self, sub='sub-alerta', email='user@mail.com', roles=('user',)):
        self.id = sub
        self.email = email
        self.roles = list(roles)
        self.username = 'alertuser'
        self.is_superuser = False

    @property
    def is_authenticated(self):
        return True

    def __str__(self):
        return self.username


def alerta_view(acciones):
    return AlertaTasaViewSet.as_view(acciones)


class AlertaTasaTest(APITestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.user = UsuarioFake()
        self.otro = UsuarioFake(sub='sub-otro', email='otro@mail.com')
        self.usd, _ = Moneda.objects.get_or_create(
            codigo='USD', defaults={'nombre': 'Dólar'})

    def _crear(self, user, datos):
        req = self.factory.post('/api/alertas/', datos, format='json')
        force_authenticate(req, user=user)
        return alerta_view({'post': 'create'})(req)

    def test_crea_alerta_con_dueno_del_token(self):
        resp = self._crear(self.user, {
            'moneda': self.usd.pk, 'umbral': 7500, 'direccion': 'supera'})
        self.assertEqual(resp.status_code, 201)
        alerta = AlertaTasa.objects.get(pk=resp.data['id'])
        self.assertEqual(alerta.usuario_sub, 'sub-alerta')
        self.assertEqual(alerta.usuario_email, 'user@mail.com')
        self.assertEqual(alerta.estado, 'activa')

    def test_rechaza_umbral_no_positivo(self):
        resp = self._crear(self.user, {
            'moneda': self.usd.pk, 'umbral': 0, 'direccion': 'supera'})
        self.assertEqual(resp.status_code, 400)

    def test_lista_solo_mis_alertas(self):
        self._crear(self.user, {
            'moneda': self.usd.pk, 'umbral': 7500, 'direccion': 'supera'})
        self._crear(self.otro, {
            'moneda': self.usd.pk, 'umbral': 7000, 'direccion': 'baja'})
        req = self.factory.get('/api/alertas/')
        force_authenticate(req, user=self.user)
        resp = alerta_view({'get': 'list'})(req)
        self.assertEqual(len(resp.data), 1)
        self.assertEqual(resp.data[0]['moneda_codigo'], 'USD')

    def test_edita_umbral_y_pausa_reanuda(self):
        resp = self._crear(self.user, {
            'moneda': self.usd.pk, 'umbral': 7500, 'direccion': 'supera'})
        pk = resp.data['id']
        req = self.factory.patch(f'/api/alertas/{pk}/', {'umbral': 7600}, format='json')
        force_authenticate(req, user=self.user)
        resp2 = alerta_view({'patch': 'partial_update'})(req, pk=pk)
        self.assertEqual(resp2.status_code, 200)
        self.assertEqual(str(resp2.data['umbral']), '7600.00')
        req = self.factory.patch(f'/api/alertas/{pk}/', {'estado': 'pausada'}, format='json')
        force_authenticate(req, user=self.user)
        resp3 = alerta_view({'patch': 'partial_update'})(req, pk=pk)
        self.assertEqual(resp3.data['estado'], 'pausada')

    def test_no_edita_alerta_ejecutada(self):
        resp = self._crear(self.user, {
            'moneda': self.usd.pk, 'umbral': 7500, 'direccion': 'supera'})
        pk = resp.data['id']
        alerta = AlertaTasa.objects.get(pk=pk)
        alerta.estado = 'ejecutada'
        alerta.save()
        req = self.factory.patch(f'/api/alertas/{pk}/', {'umbral': 9000}, format='json')
        force_authenticate(req, user=self.user)
        resp2 = alerta_view({'patch': 'partial_update'})(req, pk=pk)
        self.assertEqual(resp2.status_code, 400)

    def test_elimina_alerta(self):
        resp = self._crear(self.user, {
            'moneda': self.usd.pk, 'umbral': 7500, 'direccion': 'supera'})
        pk = resp.data['id']
        req = self.factory.delete(f'/api/alertas/{pk}/')
        force_authenticate(req, user=self.user)
        resp2 = alerta_view({'delete': 'destroy'})(req, pk=pk)
        self.assertEqual(resp2.status_code, 204)
        self.assertFalse(AlertaTasa.objects.filter(pk=pk).exists())

    def test_dispara_supera_y_marca_ejecutada(self):
        self._crear(self.user, {
            'moneda': self.usd.pk, 'umbral': 7500, 'direccion': 'supera'})
        cot = Cotizacion.objects.create(moneda=self.usd, compra=7450, venta=7550)
        self.assertEqual(evaluar_alertas(cot), 1)
        alerta = AlertaTasa.objects.get(usuario_sub='sub-alerta')
        self.assertEqual(alerta.estado, 'ejecutada')
        disparo = DisparoAlerta.objects.get(alerta=alerta)
        self.assertEqual(disparo.tasa_alcanzada, 7550)

    def test_no_dispara_si_no_cruza_ni_pausada(self):
        self._crear(self.user, {
            'moneda': self.usd.pk, 'umbral': 8000, 'direccion': 'supera'})
        resp = self._crear(self.user, {
            'moneda': self.usd.pk, 'umbral': 7000, 'direccion': 'baja'})
        alerta_baja = AlertaTasa.objects.get(pk=resp.data['id'])
        alerta_baja.estado = 'pausada'
        alerta_baja.save()
        cot = Cotizacion.objects.create(moneda=self.usd, compra=7450, venta=7550)
        self.assertEqual(evaluar_alertas(cot), 0)
        self.assertEqual(DisparoAlerta.objects.count(), 0)

    def test_no_redispara_ejecutada(self):
        self._crear(self.user, {
            'moneda': self.usd.pk, 'umbral': 7500, 'direccion': 'supera'})
        cot = Cotizacion.objects.create(moneda=self.usd, compra=7450, venta=7550)
        evaluar_alertas(cot)
        cot2 = Cotizacion.objects.create(moneda=self.usd, compra=7600, venta=7700)
        self.assertEqual(evaluar_alertas(cot2), 0)
        self.assertEqual(DisparoAlerta.objects.count(), 1)

    def test_rearma_y_dispara_en_nuevo_cruce(self):
        self._crear(self.user, {
            'moneda': self.usd.pk, 'umbral': 7600, 'direccion': 'supera'})
        alta = Cotizacion.objects.create(moneda=self.usd, compra=7550, venta=7650)
        self.assertEqual(evaluar_alertas(alta), 1)
        baja = Cotizacion.objects.create(moneda=self.usd, compra=7450, venta=7500)
        self.assertEqual(evaluar_alertas(baja), 0)
        self.assertEqual(
            AlertaTasa.objects.get(usuario_sub='sub-alerta').estado, 'activa')
        alta2 = Cotizacion.objects.create(moneda=self.usd, compra=7650, venta=7700)
        self.assertEqual(evaluar_alertas(alta2), 1)
        self.assertEqual(DisparoAlerta.objects.count(), 2)

    def test_dispara_baja_contra_compra(self):
        self._crear(self.user, {
            'moneda': self.usd.pk, 'umbral': 7450, 'direccion': 'baja'})
        cot = Cotizacion.objects.create(moneda=self.usd, compra=7400, venta=7550)
        self.assertEqual(evaluar_alertas(cot), 1)

    def test_post_cotizacion_dispara_alerta(self):
        self._crear(self.user, {
            'moneda': self.usd.pk, 'umbral': 7500, 'direccion': 'supera'})
        admin = UsuarioFake(sub='sub-admin', roles=('admin',))
        req = self.factory.post('/api/cotizaciones/', {
            'moneda': self.usd.pk, 'compra': 7450, 'venta': 7550}, format='json')
        force_authenticate(req, user=admin)
        resp = CotizacionViewSet.as_view({'post': 'create'})(req)
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(DisparoAlerta.objects.count(), 1)
        self.assertEqual(
            AlertaTasa.objects.get(usuario_sub='sub-alerta').estado, 'ejecutada')

    def test_historial_solo_mio(self):
        self._crear(self.user, {
            'moneda': self.usd.pk, 'umbral': 7500, 'direccion': 'supera'})
        cot = Cotizacion.objects.create(moneda=self.usd, compra=7450, venta=7550)
        evaluar_alertas(cot)
        req = self.factory.get('/api/alertas/historial/')
        force_authenticate(req, user=self.user)
        resp = alerta_view({'get': 'historial'})(req)
        self.assertEqual(len(resp.data), 1)
        self.assertEqual(resp.data[0]['moneda_codigo'], 'USD')
        req2 = self.factory.get('/api/alertas/historial/')
        force_authenticate(req2, user=self.otro)
        resp2 = alerta_view({'get': 'historial'})(req2)
        self.assertEqual(len(resp2.data), 0)
