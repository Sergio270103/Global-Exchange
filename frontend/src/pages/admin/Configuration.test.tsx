/**
 * Pruebas PI-72 de configuración (tabs + ajustes de precio contra API).
 *
 * @module Configuration.test
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Configuration from '@/pages/admin/Configuration'

function respuesta(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('Configuration (API + tabs)', () => {
  /** Fila de `Denominacion` tal como la devuelve el backend. */
  interface DenominacionApi {
    id: number
    moneda: number
    moneda_codigo: string
    moneda_nombre: string
    simbolo: string
    decimales: number
    valor: string
    activa: boolean
  }

  /**
   * `DKK` está activa pero sin billetes: es el caso real que reportaba el
   * cajero (no aparecía en el formulario de entregas).
   */
  const catalogo = [
    { id: 1, codigo: 'USD', nombre: 'Dólar', simbolo: '$', decimales: 2, pais_iso: 'US', activo: true, saldo_minimo: '0.00' },
    { id: 2, codigo: 'PYG', nombre: 'Guaraní Paraguayo', simbolo: '₲', decimales: 0, pais_iso: 'PY', activo: true, saldo_minimo: '0.00' },
    { id: 3, codigo: 'DKK', nombre: 'Corona Danesa', simbolo: 'kr', decimales: 2, pais_iso: 'DK', activo: true, saldo_minimo: '0.00' },
  ]

  /** Filas de `Denominacion`. Se amplía desde cada test. */
  let denominaciones: DenominacionApi[] = [
    { id: 1, moneda: 1, moneda_codigo: 'USD', moneda_nombre: 'Dólar', simbolo: '$', decimales: 2, valor: '100.00', activa: true },
    { id: 2, moneda: 1, moneda_codigo: 'USD', moneda_nombre: 'Dólar', simbolo: '$', decimales: 2, valor: '20.00', activa: true },
  ]

  const mockFetch = () =>
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const u = String(url)
      const method = (init.method ?? 'GET').toUpperCase()
      if (u.includes('/monedas/') && method === 'PATCH') {
        const cuerpo = JSON.parse(String(init.body))
        const id = Number(u.match(/monedas\/(\d+)/)?.[1])
        const i = catalogo.findIndex(m => m.id === id)
        catalogo[i] = { ...catalogo[i], ...cuerpo }
        return respuesta(catalogo[i])
      }
      if (u.includes('/monedas/')) return respuesta(catalogo)
      if (u.includes('/denominaciones/') && method === 'POST') {
        const d = JSON.parse(String(init.body))
        const moneda = catalogo.find(m => m.id === d.moneda)!
        const creada: DenominacionApi = {
          id: denominaciones.length + 10,
          moneda: moneda.id,
          moneda_codigo: moneda.codigo,
          moneda_nombre: moneda.nombre,
          simbolo: moneda.simbolo,
          decimales: moneda.decimales,
          valor: String(d.valor),
          activa: true,
        }
        denominaciones = [...denominaciones, creada]
        return respuesta(creada, 201)
      }
      if (u.includes('/denominaciones/') && method === 'PATCH') {
        const id = Number(u.match(/denominaciones\/(\d+)/)?.[1])
        const d = JSON.parse(String(init.body))
        const actualizada = { ...denominaciones.find(x => x.id === id)!, ...d }
        denominaciones = denominaciones.map(x => (x.id === id ? actualizada : x))
        return respuesta(actualizada)
      }
      if (u.includes('/denominaciones/')) {
        // Respetar `?moneda=`: el backend filtra y el modal no puede ver
        // los billetes de otra moneda.
        const filtro = new URL(u, 'http://x').searchParams.get('moneda')
        return respuesta(
          filtro ? denominaciones.filter(d => String(d.moneda) === filtro) : denominaciones,
        )
      }
      if (u.includes('/metodos-pago/')) {
        return respuesta([{ id: 1, codigo: 'transfer', nombre: 'Transferencia', activo: true }])
      }
      if (u.includes('/ajustes-precios/simulador/')) {
        return respuesta({ MINORISTA: 1.0, CORPORATIVO: 0.75, VIP: 0.5 })
      }
      if (u.includes('/ajustes-precios/') && method === 'PUT') return respuesta({ ok: true })
      return respuesta([])
    })

  beforeEach(() => {
    denominaciones = [
      { id: 1, moneda: 1, moneda_codigo: 'USD', moneda_nombre: 'Dólar', simbolo: '$', decimales: 2, valor: '100.00', activa: true },
      { id: 2, moneda: 1, moneda_codigo: 'USD', moneda_nombre: 'Dólar', simbolo: '$', decimales: 2, valor: '20.00', activa: true },
    ]
    vi.stubGlobal('fetch', mockFetch())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('muestra monedas y navega por tabs', async () => {
    const user = userEvent.setup()
    render(<Configuration />)
    expect(await screen.findByText('Monedas admitidas')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Métodos de pago' }))
    expect(screen.getByText('Métodos de pago habilitados')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Seguridad' }))
    expect(screen.getByText('Autenticación de dos factores (2FA)')).toBeInTheDocument()
  })

  it('guarda un ajuste de precio por categoría', async () => {
    const user = userEvent.setup()
    render(<Configuration />)
    await screen.findByText('Monedas admitidas')
    await user.click(screen.getByRole('button', { name: 'Ajustes por categoría' }))
    expect(screen.getByText('Ajustes de precio por categoría')).toBeInTheDocument()
    await user.clear(screen.getByLabelText('Porcentaje MINORISTA'))
    await user.type(screen.getByLabelText('Porcentaje MINORISTA'), '2')
    await user.click(screen.getAllByRole('button', { name: 'Guardar' })[0])
    expect(await screen.findByText('Ajuste de minorista actualizado a 2%.')).toBeInTheDocument()
  })

  it('avisa que hay una moneda activa sin billetes registrados', async () => {
    render(<Configuration />)
    await screen.findByText('Monedas admitidas')
    // DKK no tiene filas en Denominacion: hay que decirlo, no dejarla
    // desaparecer en silencio del formulario de entregas.
    expect(await screen.findByText(/está activa pero no tiene billetes registrados/)).toBeInTheDocument()
    // El aviso nombra a las dos que no tienen (DKK y PYG).
    expect(screen.getByText(/DKK, PYG/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Gestionar billetes de DKK' })).toHaveTextContent('Sin billetes')
    expect(screen.getByRole('button', { name: 'Gestionar billetes de USD' })).toHaveTextContent('2 cargados')
  })

  it('registra un billete para una moneda que no tenía ninguno', async () => {
    const user = userEvent.setup()
    render(<Configuration />)
    await screen.findByText('Monedas admitidas')
    await user.click(screen.getByRole('button', { name: 'Gestionar billetes de DKK' }))
    expect(await screen.findByRole('dialog', { name: /Billetes de DKK/ })).toBeInTheDocument()
    expect(screen.getByText(/Todavía no hay billetes cargados para DKK/)).toBeInTheDocument()

    await user.type(screen.getByLabelText('Valor del billete en DKK'), '1000')
    await user.click(screen.getByRole('button', { name: 'Agregar' }))

    // El nuevo billete aparece en la lista del modal...
    expect(await screen.findByRole('button', { name: /Desactivar billete de 1000 DKK/ })).toBeInTheDocument()
    // ...y el aviso de la tabla desaparece para DKK.
    await user.click(screen.getByRole('button', { name: 'Cerrar' }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Gestionar billetes de DKK' }))
        .toHaveTextContent('1 cargados'))
  })

  it('rechaza un valor de billete inválido sin llamar a la API', async () => {
    const user = userEvent.setup()
    render(<Configuration />)
    await screen.findByText('Monedas admitidas')
    await user.click(screen.getByRole('button', { name: 'Gestionar billetes de DKK' }))
    await screen.findByRole('dialog', { name: /Billetes de DKK/ })

    await user.type(screen.getByLabelText('Valor del billete en DKK'), '0')
    await user.click(screen.getByRole('button', { name: 'Agregar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/mayor que cero/)

    const posts = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls
      .filter(([u, i]) => String(u).includes('/denominaciones/') && (i as RequestInit).method === 'POST')
    expect(posts).toHaveLength(0)
  })

  it('PI-80: guarda el saldo mínimo de una divisa', async () => {
    const user = userEvent.setup()
    render(<Configuration />)
    await screen.findByText('Monedas admitidas')
    const campo = screen.getByLabelText('Saldo mínimo de USD')
    await user.clear(campo)
    await user.type(campo, '500')
    await user.tab()

    expect(await screen.findByRole('status')).toHaveTextContent(
      'El cajero verá el aviso de reposición cuando USD baje de 500.',
    )
    const patch = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.find(
      ([u, i]) => String(u).includes('/monedas/1/') && (i as RequestInit).method === 'PATCH',
    )
    expect(JSON.parse(String(patch![1].body))).toEqual({ saldo_minimo: '500' })
  })

  it('PI-80: avisa si el saldo mínimo no es un número', async () => {
    const user = userEvent.setup()
    render(<Configuration />)
    await screen.findByText('Monedas admitidas')
    const campo = screen.getByLabelText('Saldo mínimo de USD')
    await user.clear(campo)
    await user.type(campo, '-5')
    await user.tab()

    expect(await screen.findByRole('status')).toHaveTextContent('mayor o igual a cero')
    // No se llamó a la API con un valor inválido.
    const patches = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([u, i]) => String(u).includes('/monedas/1/') && (i as RequestInit).method === 'PATCH',
    )
    expect(patches).toHaveLength(0)
  })

  it('PI-80: el guaraní no admite decimales en el mínimo', async () => {
    const user = userEvent.setup()
    render(<Configuration />)
    await screen.findByText('Monedas admitidas')
    const campo = screen.getByLabelText('Saldo mínimo de PYG')
    await user.clear(campo)
    await user.type(campo, '1.5')
    await user.tab()

    expect(await screen.findByRole('status')).toHaveTextContent('no admite decimales')
  })

  it('desactiva un billete sin borrarlo del historial', async () => {
    const user = userEvent.setup()
    render(<Configuration />)
    await screen.findByText('Monedas admitidas')
    await user.click(screen.getByRole('button', { name: 'Gestionar billetes de USD' }))
    await screen.findByRole('dialog', { name: /Billetes de USD/ })
    await user.click(screen.getByRole('button', { name: /Desactivar billete de 100 USD/ }))
    expect(await screen.findByRole('button', { name: /Activar billete de 100 USD/ })).toBeInTheDocument()
    const patch = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls
      .find(([u, i]) => String(u).includes('/denominaciones/1/') && (i as RequestInit).method === 'PATCH')
    expect(patch).toBeDefined()
  })
})
