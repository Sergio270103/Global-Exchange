/**
 * Pruebas PI-71: comprar/vender refleja el catálogo de monedas activas.
 *
 * BRL está deshabilitada (con vigente vieja) y ARS activa pero sin tasa:
 * - divisa y pagar-con/recibir-en muestran GBP habilitada;
 * - ARS aparece pero DESHABILITADA ("sin cotización");
 * - BRL no aparece en ningún lado;
 * - PYG siempre disponible como contraparte.
 *
 * @module BuySell.test
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import BuySell from '@/pages/BuySell'

const vigentes = ['USD', 'EUR', 'GBP', 'BRL'].map((code, i) => ({
  id: i + 1,
  moneda: i + 1,
  moneda_codigo: code,
  moneda_nombre: code,
  compra: '7000.00',
  venta: '7100.00',
  vigente_desde: new Date().toISOString(),
  creado_por: 'admin',
}))

const catalogo = [
  { id: 1, codigo: 'PYG', nombre: 'Guaraní', simbolo: '₲', decimales: 0, pais_iso: 'PY', activo: true },
  { id: 2, codigo: 'USD', nombre: 'Dólar', simbolo: '$', decimales: 2, pais_iso: 'US', activo: true },
  { id: 3, codigo: 'EUR', nombre: 'Euro', simbolo: '€', decimales: 2, pais_iso: 'EU', activo: true },
  { id: 4, codigo: 'GBP', nombre: 'Libra', simbolo: '£', decimales: 2, pais_iso: 'GB', activo: true },
  { id: 5, codigo: 'ARS', nombre: 'Peso Argentino', simbolo: '$', decimales: 2, pais_iso: 'AR', activo: true },
]

function respuesta(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function mockFetch() {
  return vi.fn(async (url: string) => {
    const u = String(url)
    if (u.includes('/cotizaciones/vigentes/')) return respuesta(vigentes)
    if (u.includes('/monedas/')) return respuesta(catalogo)
    if (u.includes('/metodos-pago/')) {
      return respuesta([{ id: 1, codigo: 'transfer', nombre: 'Transferencia', activo: true }])
    }
    if (u.includes('/asociaciones/')) {
      return respuesta([{ id: 1, cliente: 1, cliente_nombre: 'Carlos Martínez' }])
    }
    if (u.includes('/clientes/')) {
      return respuesta([{ id: 1, nombre: 'Carlos Martínez', activo: true, categoria: 'MINORISTA' }])
    }
    if (u.includes('/billeteras/')) {
      return respuesta([
        { id: 2, cliente: 1, moneda: 2, moneda_codigo: 'USD', moneda_nombre: 'Dólar', saldo: '0.00' },
        { id: 3, cliente: 1, moneda: 1, moneda_codigo: 'PYG', moneda_nombre: 'Guaraní', saldo: '0.00' },
      ])
    }
    if (u.includes('/cuentas-bancarias/')) {
      return respuesta([
        { id: 5, cliente: 1, banco: 'Continental', numero_enmascarado: '•••• 4521', codigo_bancario: 'B', nombre: 'C', apellido: 'M', cedula: '1', moneda: 1, moneda_codigo: 'PYG', activa: true },
        // Cuenta en USD: en venta es el origen, pero no debe ofrecerse.
        { id: 6, cliente: 1, banco: 'Itaú', numero_enmascarado: '•••• 7788', codigo_bancario: 'C', nombre: 'C', apellido: 'M', cedula: '1', moneda: 2, moneda_codigo: 'USD', activa: true },
      ])
    }
    if (u.includes('/medios-acreditacion/')) {
      return respuesta([
        { id: 1, cliente: 1, cliente_nombre: 'Carlos', tipo: 'BILLETERA', tipo_display: 'Billetera digital', billetera: 2, cuenta: null, destino_detalle: 'Billetera USD', es_default: true },
      ])
    }
    return respuesta([])
  })
}

const auth = { name: 'Ana', email: 'ana@email.com', role: 'user' as const, avatar: '' }

describe('BuySell PI-71 (selects según monedas activas)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('la divisa muestra las activas con vigente y ARS deshabilitada sin tasa', async () => {
    render(<BuySell auth={auth} currentClient={{ id: 1, nombre: 'Carlos Martínez' }} />)
    await screen.findByRole('heading', { name: 'Comprar divisas' })
    const [divisa] = screen.getAllByRole('combobox')
    const gbp = within(divisa).getByRole('option', { name: /GBP/ }) as HTMLOptionElement
    expect(gbp.disabled).toBe(false)
    const ars = within(divisa).getByRole('option', { name: /ARS/ }) as HTMLOptionElement
    expect(ars.disabled).toBe(true)
    expect(within(divisa).queryByRole('option', { name: /BRL/ })).not.toBeInTheDocument()
  })

  it('pagar-con/recibir-en incluye PYG y GBP, ARS deshabilitada y sin BRL', async () => {
    render(<BuySell auth={auth} currentClient={{ id: 1, nombre: 'Carlos Martínez' }} />)
    await screen.findByRole('heading', { name: 'Comprar divisas' })
    const [, contraparte] = screen.getAllByRole('combobox')
    expect(within(contraparte).getByRole('option', { name: /PYG/ })).toBeInTheDocument()
    expect(within(contraparte).getByRole('option', { name: /GBP/ })).toBeInTheDocument()
    const ars = within(contraparte).getByRole('option', { name: /ARS/ }) as HTMLOptionElement
    expect(ars.disabled).toBe(true)
    expect(within(contraparte).queryByRole('option', { name: /BRL/ })).not.toBeInTheDocument()
  })

  it('PI-73: compra por transferencia pide la cuenta y acredita en billetera', async () => {
    render(<BuySell auth={auth} currentClient={{ id: 1, nombre: 'Carlos Martínez' }} />)
    await screen.findByRole('heading', { name: 'Comprar divisas' })
    // Transferencia: solo cuentas en PYG, sin billeteras como opción.
    const cuenta = await screen.findByLabelText(/Cuenta bancaria/) as HTMLSelectElement
    expect(within(cuenta).getByRole('option', { name: /Continental/ })).toBeInTheDocument()
    expect(within(cuenta).queryByRole('option', { name: /Itaú/ })).not.toBeInTheDocument()
    expect(within(cuenta).queryByRole('option', { name: /Billetera/ })).not.toBeInTheDocument()
    // Lo comprado se acredita siempre en la billetera USD.
    expect(screen.getByText(/se acreditará en tu billetera USD/)).toBeInTheDocument()
  })

  it('PI-73: la venta se debita de la billetera y no ofrece cuentas', async () => {
    const user = userEvent.setup()
    render(<BuySell auth={auth} currentClient={{ id: 1, nombre: 'Carlos Martínez' }} />)
    await screen.findByRole('heading', { name: 'Comprar divisas' })
    await user.click(screen.getByRole('button', { name: /Vender divisas/ }))
    await screen.findByRole('heading', { name: 'Vender divisas' })
    // La venta se debita de la billetera USD, nunca de una cuenta externa.
    expect(screen.queryByLabelText(/Cuenta bancaria/)).not.toBeInTheDocument()
    expect(screen.getByText(/Se descontará de tu billetera USD/)).toBeInTheDocument()
    expect(screen.getByText(/se acreditará en tu billetera PYG/)).toBeInTheDocument()
  })
})
