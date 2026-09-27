/**
 * Pruebas PI-66: billetera real por cliente con saldos y medios de
 * acreditación vinculados (saldos nacen en cero).
 *
 * @module Wallets.test
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Wallets from '@/pages/Wallets'

let medios = [
  { id: 1, cliente: 1, cliente_nombre: 'Carlos', tipo: 'BILLETERA', tipo_display: 'Billetera digital', billetera: 2, cuenta: null, destino_detalle: 'Carlos · USD: 0.00', es_default: true },
]

const billeteras = [
  { id: 1, cliente: 1, moneda: 1, moneda_codigo: 'PYG', moneda_nombre: 'Guaraní', saldo: '0.00' },
  { id: 2, cliente: 1, moneda: 2, moneda_codigo: 'USD', moneda_nombre: 'Dólar', saldo: '150.00' },
]

const cuentas = [
  { id: 5, cliente: 1, banco: 'Continental', numero_enmascarado: '•••• 4521', codigo_bancario: 'B', nombre: 'C', apellido: 'M', cedula: '1', moneda: 1, moneda_codigo: 'PYG', activa: true },
]

function respuesta(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function mockFetch() {
  return vi.fn(async (url: string, init: RequestInit = {}) => {
    const u = String(url)
    const method = (init.method ?? 'GET').toUpperCase()
    if (u.includes('/asociaciones/')) return respuesta([{ id: 1, cliente: 1, cliente_nombre: 'Carlos' }])
    if (u.includes('/billeteras/')) return respuesta(billeteras)
    if (u.includes('/cuentas-bancarias/')) return respuesta(cuentas)
    if (u.includes('/cotizaciones/vigentes/')) {
      return respuesta([{ id: 1, moneda: 2, moneda_codigo: 'USD', moneda_nombre: 'Dólar', compra: '7400', venta: '7500', vigente_desde: new Date().toISOString(), creado_por: 'a' }])
    }
    if (u.includes('/medios-acreditacion/')) {
      if (method === 'GET') return respuesta(medios)
      if (method === 'POST') {
        const cuerpo = JSON.parse(String(init.body ?? '{}'))
        const nuevo = { id: 99, cliente: 1, cliente_nombre: 'Carlos', tipo: cuerpo.tipo, tipo_display: cuerpo.tipo, billetera: cuerpo.billetera ?? null, cuenta: cuerpo.cuenta ?? null, destino_detalle: 'Nuevo medio', es_default: !!cuerpo.es_default }
        medios = cuerpo.es_default ? [...medios.map(m => ({ ...m, es_default: false })), nuevo] : [...medios, nuevo]
        return respuesta(nuevo, 201)
      }
    }
    return respuesta([])
  })
}

describe('Wallets PI-66 (saldos y medios reales)', () => {
  beforeEach(() => {
    medios = [
      { id: 1, cliente: 1, cliente_nombre: 'Carlos', tipo: 'BILLETERA', tipo_display: 'Billetera digital', billetera: 2, cuenta: null, destino_detalle: 'Carlos · USD: 0.00', es_default: true },
    ]
    vi.stubGlobal('fetch', mockFetch())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function renderWallets() {
    render(<Wallets navigate={vi.fn()} currentClient={{ id: 1, nombre: 'Carlos' }} />)
  }

  it('muestra los saldos por moneda y el total equivalente', async () => {
    renderWallets()
    expect(await screen.findByText('Billetera digital multidivisa')).toBeInTheDocument()
    expect(screen.getByText('PYG — Guaraní')).toBeInTheDocument()
    expect(screen.getByText('USD — Dólar')).toBeInTheDocument()
    // 150 USD * 7500 = 1.125.000 ₲
    expect(screen.getByText(/1\.125\.000/)).toBeInTheDocument()
  })

  it('muestra el medio por defecto vinculado', async () => {
    renderWallets()
    await screen.findByText('Billetera digital multidivisa')
    expect(screen.getByText('Por defecto')).toBeInTheDocument()
    expect(screen.getByText('Carlos · USD: 0.00')).toBeInTheDocument()
  })

  it('vincula un medio nuevo de tipo cuenta', async () => {
    const user = userEvent.setup()
    renderWallets()
    await screen.findByText('Billetera digital multidivisa')
    await user.click(screen.getByRole('button', { name: '+ Vincular medio' }))
    await user.selectOptions(screen.getByLabelText('Tipo'), 'Cuenta bancaria')
    await user.selectOptions(screen.getByLabelText('Destino'), '5')
    await user.click(screen.getByRole('button', { name: 'Vincular' }))
    expect(await screen.findByText('Nuevo medio')).toBeInTheDocument()
  })
})
