/**
 * Pruebas del dashboard de usuario con datos reales.
 *
 * Se simulan billeteras, historial, cotizaciones y monedas: saldo total
 * del cliente activo, conteo PAGADA, últimas 2 operaciones como tarjetas,
 * gráfico compra/venta, saldos por moneda y tasas destacadas. Los accesos
 * rápidos y las operaciones recientes no se modifican.
 *
 * @module Dashboard.test
 */
import { afterEach, describe, it, expect, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@/services/historial', async importOriginal => {
  const real = await importOriginal<typeof import('@/services/historial')>()
  const ahora = new Date().toISOString()
  return {
    ...real,
    listarHistorial: vi.fn().mockResolvedValue([
      {
        id: 2, cliente: 1, cliente_nombre: 'Carlos', usuario_keycloak_id: 'sub',
        usuario_nombre: 'Carlos', tipo_operacion: 'VENTA', moneda_origen: 3,
        moneda_origen_codigo: 'EUR', moneda_destino: 1, moneda_destino_codigo: 'PYG',
        monto_enviado: 1820.5, monto_recibido: 15000000, cotizacion_aplicada: 8240,
        tasa_origen: 8250, tasa_destino: null, metodo_pago: '', fecha_creacion: ahora,
        estado: 'PAGADA', fecha_cotizacion: ahora, fecha_confirmacion: ahora,
        fecha_cancelacion: null, cancelada_por: '', cancelada_por_nombre: '',
        motivo_cancelacion: '', tolerancia_segundos: 30, segundos_restantes: 0,
      },
      {
        id: 1, cliente: 1, cliente_nombre: 'Carlos', usuario_keycloak_id: 'sub',
        usuario_nombre: 'Carlos', tipo_operacion: 'COMPRA', moneda_origen: 1,
        moneda_origen_codigo: 'PYG', moneda_destino: 2, moneda_destino_codigo: 'USD',
        monto_enviado: 18742500, monto_recibido: 2450, cotizacion_aplicada: 7650,
        tasa_origen: null, tasa_destino: 7650, metodo_pago: '', fecha_creacion: ahora,
        estado: 'PAGADA', fecha_cotizacion: ahora, fecha_confirmacion: ahora,
        fecha_cancelacion: null, cancelada_por: '', cancelada_por_nombre: '',
        motivo_cancelacion: '', tolerancia_segundos: 30, segundos_restantes: 0,
      },
    ]),
  }
})

vi.mock('@/services/billeteras', async importOriginal => {
  const real = await importOriginal<typeof import('@/services/billeteras')>()
  return {
    ...real,
    listarBilleteras: vi.fn().mockResolvedValue([
      { id: 1, cliente: 1, moneda: 1, moneda_codigo: 'PYG', moneda_nombre: 'Guaraní', flag: '🇵🇾', saldo: 62313470 },
    ]),
  }
})

vi.mock('@/services/cotizaciones', () => ({
  vigentes: vi.fn().mockResolvedValue([
    { id: 1, moneda: 'USD', nombre: 'Dólar', flag: '🇺🇸', compra: 7580, venta: 7650, vigente_desde: '2026-01-02', creado_por: 'admin' },
  ]),
  historial: vi.fn().mockResolvedValue([
    { id: 1, moneda: 'USD', nombre: 'Dólar', flag: '🇺🇸', compra: 7580, venta: 7580, vigente_desde: '2026-01-01', creado_por: 'admin' },
    { id: 2, moneda: 'USD', nombre: 'Dólar', flag: '🇺🇸', compra: 7580, venta: 7650, vigente_desde: '2026-01-02', creado_por: 'admin' },
  ]),
}))

vi.mock('@/services/monedas', async importOriginal => {
  const real = await importOriginal<typeof import('@/services/monedas')>()
  return {
    ...real,
    listarMonedas: vi.fn().mockResolvedValue([
      { id: 1, code: 'PYG', name: 'Guaraní', symbol: '₲', flag: '🇵🇾', decimals: 0, active: true },
    ]),
  }
})

// PI-38: el modal de alertas no debe aparecer en estos tests.
vi.mock('@/services/alertas', async importOriginal => {
  const real = await importOriginal<typeof import('@/services/alertas')>()
  return {
    ...real,
    listarAlertas: vi.fn().mockResolvedValue([]),
    crearAlerta: vi.fn(),
    actualizarAlerta: vi.fn(),
    eliminarAlerta: vi.fn(),
    historialDisparos: vi.fn().mockResolvedValue([]),
  }
})

import Dashboard, { puntosPorOperacion } from '@/pages/Dashboard'

const auth = { name: 'Ana López', email: 'ana@email.com', role: 'user' as const, avatar: '' }

describe('Dashboard (usuario, datos reales)', () => {
  afterEach(() => {
    cleanup()
  })

  function renderDash() {
    const navigate = vi.fn()
    render(<Dashboard auth={auth} currentClient={{ id: 1, nombre: 'Carlos' }} navigate={navigate} />)
    return navigate
  }

  it('muestra saludo, tarjetas reales, gráfico y tasas', async () => {
    renderDash()
    expect(screen.getByText('Ana 👋')).toBeInTheDocument()
    expect((await screen.findAllByText('₲ 62.313.470')).length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('1 compras · 1 ventas')).toBeInTheDocument()
    expect((await screen.findAllByText('Venta EUR')).length).toBe(2)
    expect((await screen.findAllByText('Compra USD')).length).toBe(2)
    expect(screen.getByText('Evolución de operaciones')).toBeInTheDocument()
    expect(screen.getByText('Monto en PYG por operación')).toBeInTheDocument()
    expect(screen.getByText('Billeteras')).toBeInTheDocument()
    expect(screen.getByText('Operaciones recientes')).toBeInTheDocument()
    expect(screen.getByText('Tasas destacadas')).toBeInTheDocument()
  })

  it('avisa cuando no hay cliente activo', async () => {
    render(<Dashboard auth={auth} currentClient={null} navigate={vi.fn()} />)
    expect(await screen.findByText('Seleccioná un cliente para ver el saldo y las operaciones de tu cuenta.')).toBeInTheDocument()
  })

  it('navega a comprar, billeteras e historial', async () => {
    const user = userEvent.setup()
    const navigate = renderDash()
    await user.click(screen.getByRole('button', { name: '+ Nueva operación' }))
    expect(navigate).toHaveBeenCalledWith('buy')
    await user.click(screen.getAllByText('Ver todo →')[0])
    expect(navigate).toHaveBeenCalledWith('wallets')
    await user.click(screen.getAllByText('Ver todo →')[1])
    expect(navigate).toHaveBeenCalledWith('transactions')
  })
})

describe('puntosPorOperacion', () => {
  function op(extra: Record<string, unknown>) {
    return {
      id: 1, cliente: 1, cliente_nombre: 'Carlos', usuario_keycloak_id: 'sub',
      usuario_nombre: 'Carlos', tipo_operacion: 'COMPRA', moneda_origen: 1,
      moneda_origen_codigo: 'PYG', moneda_destino: 2, moneda_destino_codigo: 'USD',
      monto_enviado: 0, monto_recibido: 0, cotizacion_aplicada: 0,
      tasa_origen: null, tasa_destino: null, metodo_pago: '', billetera_destino: null,
      billetera_destino_detalle: '', cuenta_origen: null, cuenta_origen_detalle: '',
      billetera_origen: null, billetera_origen_detalle: '', fecha_creacion: '',
      estado: 'PAGADA', fecha_cotizacion: '', fecha_confirmacion: null,
      fecha_cancelacion: null, cancelada_por: '', cancelada_por_nombre: '',
      motivo_cancelacion: '', tolerancia_segundos: 30, segundos_restantes: 0,
      ...extra,
    } as unknown as import('@/services/operaciones').Operacion
  }

  const compraUSD = op({
    id: 1, tipo_operacion: 'COMPRA', moneda_destino_codigo: 'USD',
    monto_recibido: 2450, tasa_destino: 7650, fecha_creacion: '2026-01-10T10:00:00',
  })
  const ventaPYG = op({
    id: 2, tipo_operacion: 'VENTA', moneda_destino_codigo: 'PYG',
    monto_recibido: 15000000, fecha_creacion: '2026-03-05T10:00:00',
  })

  it('numera cronológicamente y convierte cada monto a PYG', () => {
    const puntos = puntosPorOperacion([ventaPYG, compraUSD], new Date('2025-01-01'), new Map())
    expect(puntos.map(p => p.seq)).toEqual([1, 2])
    expect(puntos[0].pyg).toBe(2450 * 7650)
    expect(puntos[1].pyg).toBe(15000000)
    expect(puntos.map(p => p.tipo)).toEqual(['COMPRA', 'VENTA'])
  })

  it('filtra fuera de rango y omite sin tasa disponible', () => {
    const sinTasa = op({
      id: 3, tipo_operacion: 'COMPRA', moneda_destino_codigo: 'GBP',
      monto_recibido: 100, fecha_creacion: '2026-03-06T10:00:00',
    })
    const puntos = puntosPorOperacion(
      [compraUSD, ventaPYG, sinTasa], new Date('2026-02-01'), new Map(),
    )
    expect(puntos.map(p => p.seq)).toEqual([1])
    expect(puntos[0].tipo).toBe('VENTA')
  })
})
