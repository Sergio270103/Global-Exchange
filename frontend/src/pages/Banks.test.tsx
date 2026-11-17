/**
 * Pruebas de la vista Banks (CRUD de medios de pago del cliente, RF16/RF26).
 *
 * El `fetch` se mockea para simular la API Django: listado inicial,
 * validación del formulario, alta, edición y eliminación con
 * confirmación de cuentas bancarias.
 *
 * @module Banks.test
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Banks from '@/pages/Banks'

const clientes = [
  { id: 1, nombre: 'Carlos Martínez', documento: '12.345.678', email: 'carlos@email.com', tipo: 'FISICA', categoria: 'MINORISTA', activo: true },
]

const monedas = [
  { id: 1, codigo: 'PYG', nombre: 'Guaraní Paraguayo', simbolo: '₲', decimales: 0, pais_iso: 'PY', activo: true },
  { id: 2, codigo: 'USD', nombre: 'Dólar Americano', simbolo: '$', decimales: 2, pais_iso: 'US', activo: true },
]

let cuentas = [
  { id: 1, cliente: 1, cliente_nombre: 'Carlos Martínez', nombre: 'Carlos', apellido: 'Martínez', cedula: '12.345.678', banco: 'Banco Continental', numero_enmascarado: '•••• •••• 4521', codigo_bancario: 'BCON-PY', moneda: 1, moneda_codigo: 'PYG', activa: true },
  { id: 2, cliente: 1, cliente_nombre: 'Carlos Martínez', nombre: 'Carlos', apellido: 'Martínez', cedula: '12.345.678', banco: 'Itaú Paraguay', numero_enmascarado: '•••• •••• 8832', codigo_bancario: 'ITAU-PY', moneda: 2, moneda_codigo: 'USD', activa: true },
]

function respuesta(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function mockFetch() {
  return vi.fn(async (url: string, init: RequestInit = {}) => {
    const method = (init.method ?? 'GET').toUpperCase()
    if (url.includes('/clientes/')) return respuesta(clientes)
    if (url.includes('/monedas/')) return respuesta(monedas)
    if (url.includes('/cuentas-bancarias/')) {
      if (method === 'GET') return respuesta(cuentas.filter(c => c.cliente === Number(new URL(url).searchParams.get('cliente'))))
      const cuerpo = JSON.parse(String(init.body ?? '{}'))
      if (method === 'POST') {
        const digitos = String(cuerpo.numero_cuenta ?? '').replace(/\D/g, '')
        const nueva = {
          id: 3,
          cliente: cuerpo.cliente,
          cliente_nombre: 'Carlos Martínez',
          nombre: cuerpo.nombre,
          apellido: cuerpo.apellido,
          cedula: cuerpo.cedula,
          banco: cuerpo.banco,
          numero_enmascarado: `•••• •••• ${digitos.slice(-4)}`,
          codigo_bancario: cuerpo.codigo_bancario,
          moneda: cuerpo.moneda,
          moneda_codigo: cuerpo.moneda === 2 ? 'USD' : 'PYG',
          activa: true,
        }
        cuentas = [...cuentas, nueva]
        return respuesta(nueva, 201)
      }
      const id = Number(url.match(/cuentas-bancarias\/(\d+)\//)?.[1])
      if (method === 'DELETE') {
        cuentas = cuentas.filter(c => c.id !== id)
        return respuesta(cuentas.find(c => c.id === id) ?? { id, activa: false })
      }
      const actual = cuentas.find(c => c.id === id) ?? cuentas[0]
      return respuesta({
        ...actual,
        nombre: cuerpo.nombre ?? actual.nombre,
        apellido: cuerpo.apellido ?? actual.apellido,
        cedula: cuerpo.cedula ?? actual.cedula,
        banco: cuerpo.banco ?? actual.banco,
        codigo_bancario: cuerpo.codigo_bancario ?? actual.codigo_bancario,
      })
    }
    return respuesta([])
  })
}

function renderBanks() {
  return render(<Banks currentClient={clientes[0]} />)
}

async function fillValidForm(user: ReturnType<typeof userEvent.setup>, overrides: Partial<Record<string, string>> = {}) {
  const data = {
    Nombre: 'Ana',
    Apellido: 'López',
    'Nº de cédula': '4.567.890',
    'Número de cuenta': '12345678',
    'Código bancario': 'SUDA-PY',
    ...overrides,
  }
  for (const [label, value] of Object.entries(data)) {
    await user.clear(screen.getByLabelText(label))
    await user.type(screen.getByLabelText(label), value)
  }
  await user.selectOptions(screen.getByLabelText('Entidad bancaria'), 'Sudameris Bank')
}

describe('Banks (CRUD de medios de pago del cliente)', () => {
  beforeEach(() => {
    cuentas = [
      { id: 1, cliente: 1, cliente_nombre: 'Carlos Martínez', nombre: 'Carlos', apellido: 'Martínez', cedula: '12.345.678', banco: 'Banco Continental', numero_enmascarado: '•••• •••• 4521', codigo_bancario: 'BCON-PY', moneda: 1, moneda_codigo: 'PYG', activa: true },
      { id: 2, cliente: 1, cliente_nombre: 'Carlos Martínez', nombre: 'Carlos', apellido: 'Martínez', cedula: '12.345.678', banco: 'Itaú Paraguay', numero_enmascarado: '•••• •••• 8832', codigo_bancario: 'ITAU-PY', moneda: 2, moneda_codigo: 'USD', activa: true },
    ]
    vi.stubGlobal('fetch', mockFetch())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('lista las cuentas bancarias vinculadas del cliente', async () => {
    renderBanks()
    expect(await screen.findByText('Banco Continental')).toBeInTheDocument()
    expect(screen.getByText('Itaú Paraguay')).toBeInTheDocument()
    expect(screen.getByText('2 cuentas vinculadas')).toBeInTheDocument()
    expect(screen.queryByLabelText('Cliente')).not.toBeInTheDocument()
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes('/clientes/'))).toBe(false)
  })

  it('sin cliente activo no consulta cuentas ni permite crearlas', () => {
    const { rerender } = render(<Banks currentClient={null} />)
    expect(screen.getByText(/Seleccioná un cliente asociado/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ Agregar cuenta' })).toBeDisabled()
    expect(fetch).not.toHaveBeenCalled()
    rerender(<Banks currentClient={{ id: -1, nombre: 'Demo' }} />)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('cambia las cuentas y descarta el formulario al cambiar el cliente activo', async () => {
    const user = userEvent.setup()
    cuentas.push({ ...cuentas[0], id: 3, cliente: 2, banco: 'Banco del segundo cliente' })
    const { rerender } = renderBanks()
    await screen.findByText('Banco Continental')
    expect(screen.queryByText('Banco del segundo cliente')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Editar cuenta Banco Continental' }))
    rerender(<Banks currentClient={{ id: 2, nombre: 'Segundo' }} />)
    expect(screen.queryByText('Editar cuenta bancaria')).not.toBeInTheDocument()
    expect(screen.queryByText('Banco Continental')).not.toBeInTheDocument()
    expect(await screen.findByText('Banco del segundo cliente')).toBeInTheDocument()
    rerender(<Banks currentClient={null} />)
    expect(screen.queryByText('Banco del segundo cliente')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ Agregar cuenta' })).toBeDisabled()
  })

  it('ignora consultas anteriores que terminan después del cambio de cliente', async () => {
    const base = mockFetch()
    let resolver!: (value: Response) => void
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) =>
      url.includes('/cuentas-bancarias/?cliente=1')
        ? new Promise<Response>(resolve => { resolver = resolve }) : base(url, init)))
    const { rerender } = renderBanks()
    await waitFor(() => expect(resolver).toBeDefined())
    rerender(<Banks currentClient={{ id: 2, nombre: 'Segundo' }} />)
    await screen.findByText('Sin cuentas vinculadas')
    await act(async () => { resolver(respuesta(cuentas)) })
    expect(screen.queryByText('Banco Continental')).not.toBeInTheDocument()
    expect(screen.getByText('Sin cuentas vinculadas')).toBeInTheDocument()
  })

  it('una creación pendiente conserva su cliente y no contamina la nueva vista', async () => {
    const user = userEvent.setup()
    const base = mockFetch()
    let resolver!: (value: Response) => void
    let cuerpo: Record<string, unknown> = {}
    vi.stubGlobal('fetch', vi.fn((url: string, init: RequestInit = {}) => {
      if (init.method === 'POST') {
        cuerpo = JSON.parse(String(init.body))
        return new Promise<Response>(resolve => { resolver = resolve })
      }
      return base(url, init)
    }))
    const { rerender } = renderBanks()
    await screen.findByText('Banco Continental')
    await user.click(screen.getByRole('button', { name: '+ Agregar cuenta' }))
    await fillValidForm(user)
    await user.click(screen.getByRole('button', { name: 'Vincular cuenta' }))
    expect(cuerpo.cliente).toBe(1)
    rerender(<Banks currentClient={{ id: 2, nombre: 'Segundo' }} />)
    await screen.findByText('Sin cuentas vinculadas')
    await act(async () => { resolver(respuesta({ ...cuentas[0], id: 3, banco: 'Sudameris Bank' }, 201)) })
    expect(screen.queryByText('Sudameris Bank')).not.toBeInTheDocument()
    expect(screen.queryByText('La cuenta quedó vinculada.')).not.toBeInTheDocument()
  })

  it('al fallar la consulta del nuevo cliente no muestra cuentas anteriores', async () => {
    const { rerender } = renderBanks()
    await screen.findByText('Banco Continental')
    const base = mockFetch()
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) =>
      url.includes('/cuentas-bancarias/') ? Promise.resolve(respuesta({ detail: 'No disponible' }, 403)) : base(url, init)))
    rerender(<Banks currentClient={{ id: 2, nombre: 'Segundo' }} />)
    await screen.findByText('No se pudieron cargar las cuentas del cliente.')
    expect(screen.queryByText('Banco Continental')).not.toBeInTheDocument()
  })

  it('muestra errores de validación al vincular con campos vacíos', async () => {
    const user = userEvent.setup()
    renderBanks()
    await screen.findByText('Banco Continental')
    await user.click(screen.getByRole('button', { name: '+ Agregar cuenta' }))
    expect(screen.getByText('Agregar cuenta bancaria')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Vincular cuenta' }))
    expect(screen.getByText('El nombre es obligatorio (mínimo 2 caracteres)')).toBeInTheDocument()
    expect(screen.getByText('El apellido es obligatorio (mínimo 2 caracteres)')).toBeInTheDocument()
    expect(screen.getByText('El Nº de cédula es obligatorio')).toBeInTheDocument()
    expect(screen.getByText('Seleccioná la entidad bancaria')).toBeInTheDocument()
    expect(screen.getByText('El Nº de cuenta debe tener al menos 6 dígitos')).toBeInTheDocument()
    expect(screen.getByText('El código bancario es obligatorio')).toBeInTheDocument()
  })

  it('vincula una cuenta nueva con datos válidos', async () => {
    const user = userEvent.setup()
    renderBanks()
    await screen.findByText('Banco Continental')
    await user.click(screen.getByRole('button', { name: '+ Agregar cuenta' }))
    await fillValidForm(user)
    await user.click(screen.getByRole('button', { name: 'Vincular cuenta' }))
    expect(await screen.findByText('Sudameris Bank')).toBeInTheDocument()
    expect(screen.getByText(/Ana López/)).toBeInTheDocument()
    expect(screen.getByText('3 cuentas vinculadas')).toBeInTheDocument()
  })

  it('edita los datos de una cuenta existente', async () => {
    const user = userEvent.setup()
    renderBanks()
    await screen.findByText('Banco Continental')
    await user.click(screen.getByRole('button', { name: 'Editar cuenta Banco Continental' }))
    expect(screen.getByText('Editar cuenta bancaria')).toBeInTheDocument()
    await user.clear(screen.getByLabelText('Apellido'))
    await user.type(screen.getByLabelText('Apellido'), 'González')
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    expect(await screen.findByText(/Carlos González/)).toBeInTheDocument()
    expect(screen.getByText('2 cuentas vinculadas')).toBeInTheDocument()
  })

  it('pide confirmación y elimina la cuenta al confirmar', async () => {
    const user = userEvent.setup()
    renderBanks()
    await screen.findByText('Itaú Paraguay')
    await user.click(screen.getByRole('button', { name: 'Eliminar cuenta Itaú Paraguay' }))
    expect(screen.getByText('Eliminar cuenta')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.getByText('Itaú Paraguay')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Eliminar cuenta Itaú Paraguay' }))
    await user.click(screen.getByRole('button', { name: 'Eliminar' }))
    expect(screen.queryByText('Itaú Paraguay')).not.toBeInTheDocument()
    expect(screen.getByText('1 cuenta vinculada')).toBeInTheDocument()
  })

  it('muestra estado vacío al eliminar todas las cuentas', async () => {
    const user = userEvent.setup()
    renderBanks()
    await screen.findByText('Banco Continental')
    for (const bank of ['Banco Continental', 'Itaú Paraguay']) {
      await user.click(screen.getByRole('button', { name: `Eliminar cuenta ${bank}` }))
      await user.click(screen.getByRole('button', { name: 'Eliminar' }))
    }
    expect(await screen.findByText('Sin cuentas vinculadas')).toBeInTheDocument()
  })
})
