/**
 * Pruebas del servicio de cajas (PI-44, PI-43, PI-78): rutas, cuerpo de
 * las peticiones y conversión de los montos que la API devuelve como texto.
 *
 * @module cajas.test
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  cancelarEntrega,
  confirmarEntrega,
  crearEntrega,
  formatearMonto,
  listarEntregas,
  rechazarEntrega,
  listarArqueos,
  listarCajas,
  listarDenominaciones,
  listarMovimientos,
  obtenerSaldo,
  registrarArqueo,
  registrarMovimiento,
} from '@/services/cajas'

function respuesta(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
}

const saldoApi = {
  caja: 1,
  monedas: [{
    moneda: 2, moneda_codigo: 'USD', moneda_nombre: 'Dólar', simbolo: '$', decimales: 2,
    total: '400',
  }],
}

const movimientoApi = {
  id: 1, tipo: 'RETIRO', tipo_display: 'Retiro', moneda_codigo: 'USD', total: '100.00',
  saldo_resultante: '300.00', usuario_nombre: 'Ana', observacion: '', creado_en: '2026-10-08T12:00:00-03:00',
}

const denominacionesApi = [
  { id: 21, moneda: 2, moneda_codigo: 'USD', moneda_nombre: 'Dólar', simbolo: '$', decimales: 2, valor: '20.00', activa: true },
  { id: 20, moneda: 2, moneda_codigo: 'USD', moneda_nombre: 'Dólar', simbolo: '$', decimales: 2, valor: '100.00', activa: true },
  { id: 10, moneda: 1, moneda_codigo: 'PYG', moneda_nombre: 'Guaraní', simbolo: '₲', decimales: 0, valor: '100000.00', activa: true },
]

const entregaApi = {
  id: 12, caja: 1, caja_nombre: 'Central · Caja 1', estado: 'PENDIENTE', estado_display: 'Pendiente',
  entregado_por_nombre: 'Admin', observacion: 'Apertura', creado_en: '2026-10-09T08:00:00-03:00',
  respondido_por_nombre: '', fecha_respuesta: null, motivo: '',
  totales: [{ moneda: 2, moneda_codigo: 'USD', simbolo: '$', decimales: 2, total: '1100', cantidad_billetes: 15 }],
  detalle: [
    { denominacion: 20, moneda_codigo: 'USD', valor: '100', cantidad: 10, subtotal: '1000' },
    { denominacion: 21, moneda_codigo: 'USD', valor: '20', cantidad: 5, subtotal: '100' },
  ],
}

describe('entregas de billetes (PI-43)', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
      const u = String(url)
      const method = (init.method ?? 'GET').toUpperCase()
      if (u.includes('/confirmar/')) return respuesta({ entrega: { ...entregaApi, estado: 'CONFIRMADA' }, monedas: saldoApi.monedas })
      if (u.includes('/rechazar/') || u.includes('/cancelar/')) {
        const { motivo } = JSON.parse(String(init.body))
        if (!motivo) return respuesta({ motivo: ['Indicá el motivo.'] }, 400)
        return respuesta({ ...entregaApi, estado: u.includes('rechazar') ? 'RECHAZADA' : 'CANCELADA', motivo })
      }
      if (u.includes('/entregas/') && method === 'POST') return respuesta({ ...entregaApi, ...JSON.parse(String(init.body)) }, 201)
      if (u.includes('/entregas/')) return respuesta([entregaApi])
      return respuesta({}, 404)
    })
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('lista con filtros y convierte montos a números', async () => {
    const [e] = await listarEntregas({ caja: 1, estado: 'PENDIENTE' })
    expect(String(fetchMock.mock.calls[0][0])).toContain('/entregas/?caja=1&estado=PENDIENTE')
    expect(e.cajaNombre).toBe('Central · Caja 1')
    expect(e.totales[0]).toEqual({ moneda: 2, monedaCodigo: 'USD', simbolo: '$', decimales: 2, total: 1100, cantidadBilletes: 15 })
    expect(e.detalle[1].subtotal).toBe(100)
  })

  it('crea una entrega sin enviar líneas en cero', async () => {
    await crearEntrega(1, [{ denominacion: 20, cantidad: 10 }, { denominacion: 21, cantidad: 0 }], 'Apertura')
    const cuerpo = JSON.parse(String(fetchMock.mock.calls[0][1].body))
    expect(cuerpo).toEqual({ caja: 1, detalle: [{ denominacion: 20, cantidad: 10 }], observacion: 'Apertura' })
  })

  it('confirma y devuelve el saldo nuevo', async () => {
    const res = await confirmarEntrega(12)
    expect(String(fetchMock.mock.calls[0][0])).toContain('/entregas/12/confirmar/')
    expect(res.entrega.estado).toBe('CONFIRMADA')
    expect(res.saldo[0].total).toBe(400)
  })

  it('rechaza y cancela con motivo', async () => {
    expect((await rechazarEntrega(12, 'Faltan billetes')).estado).toBe('RECHAZADA')
    expect((await cancelarEntrega(12, 'Caja equivocada')).motivo).toBe('Caja equivocada')
    await expect(rechazarEntrega(12, '')).rejects.toThrow('Indicá el motivo.')
  })
})

describe('cajas (servicio API)', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
      const u = String(url)
      const method = (init.method ?? 'GET').toUpperCase()
      if (u.endsWith('/cajas/')) return respuesta([{ id: 1, nombre: 'Caja 1', sucursal: 'Central', activa: true }])
      if (u.includes('/saldo/')) return respuesta(saldoApi)
      if (u.includes('/movimientos/') && method === 'POST') {
        const cuerpo = JSON.parse(String(init.body))
        if (Number(cuerpo.monto) > 400) return respuesta({ detail: 'Saldo insuficiente de USD: hay 400, se piden 500.' }, 400)
        return respuesta({ movimiento: movimientoApi, monedas: saldoApi.monedas }, 201)
      }
      if (u.includes('/movimientos/')) return respuesta([movimientoApi])
      if (u.includes('/denominaciones/')) return respuesta(denominacionesApi)
      if (u.includes('/arqueos/') && method === 'POST') {
        return respuesta({
          id: 5, usuario_nombre: 'Ana', observacion: 'x', con_diferencias: true, creado_en: '2026-10-08T18:00:00-03:00',
          detalle: [{ moneda: 2, moneda_codigo: 'USD', simbolo: '$', decimales: 2, monto_sistema: '400.00', monto_contado: '380.00', diferencia: '-20.00' }],
        }, 201)
      }
      if (u.includes('/arqueos/')) return respuesta([])
      return respuesta({}, 404)
    })
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('lista cajas y convierte el saldo a números con bandera', async () => {
    expect((await listarCajas())[0].nombre).toBe('Caja 1')
    const [usd] = await obtenerSaldo(1)
    expect(usd.total).toBe(400)
    expect(usd.flag).toBe('🇺🇸')
    expect(usd).not.toHaveProperty('denominaciones')
  })

  it('arma los filtros del historial', async () => {
    const [mov] = await listarMovimientos(1, { moneda: 'USD', tipo: 'RETIRO', limite: 10 })
    expect(mov.total).toBe(100)
    expect(mov.saldoResultante).toBe(300)
    expect(String(fetchMock.mock.calls[0][0])).toContain('/cajas/1/movimientos/?moneda=USD&tipo=RETIRO&limite=10')
  })

  it('registra un movimiento por monto y devuelve el saldo nuevo', async () => {
    const res = await registrarMovimiento(1, { tipo: 'RETIRO', moneda: 2, monto: 100 })
    const cuerpo = JSON.parse(String(fetchMock.mock.calls[0][1].body))
    expect(cuerpo).toEqual({ tipo: 'RETIRO', moneda: 2, monto: '100', observacion: '' })
    expect(res.movimiento.tipo).toBe('RETIRO')
    expect(res.saldo[0].codigo).toBe('USD')
  })

  it('propaga el mensaje del backend cuando no alcanza el saldo', async () => {
    await expect(registrarMovimiento(1, { tipo: 'RETIRO', moneda: 2, monto: 500 }))
      .rejects.toThrow('Saldo insuficiente de USD')
  })

  it('registra un arqueo por total de cada moneda', async () => {
    const arqueo = await registrarArqueo(1, [{ moneda: 2, monto: 380 }], 'x')
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toEqual({
      conteo: [{ moneda: 2, monto: '380' }], observacion: 'x',
    })
    expect(arqueo.conDiferencias).toBe(true)
    expect(arqueo.detalle[0]).toEqual({
      moneda: 2, monedaCodigo: 'USD', simbolo: '$', decimales: 2, montoSistema: 400, montoContado: 380, diferencia: -20,
    })
    expect(await listarArqueos(1)).toEqual([])
  })

  it('agrupa el catálogo de billetes por moneda, de mayor a menor', async () => {
    const catalogo = await listarDenominaciones()
    expect(String(fetchMock.mock.calls[0][0])).toContain('/denominaciones/?activas=1')
    expect(catalogo.map(m => m.codigo)).toEqual(['PYG', 'USD'])
    expect(catalogo[1].denominaciones).toEqual([
      { denominacion: 20, valor: 100 },
      { denominacion: 21, valor: 20 },
    ])
    expect(catalogo[1].flag).toBe('🇺🇸')
  })

  it('formatea montos con separador de miles', () => {
    expect(formatearMonto(1500000, 0)).toBe('1.500.000')
    expect(formatearMonto(12.5, 2)).toBe('12,5')
  })
})
