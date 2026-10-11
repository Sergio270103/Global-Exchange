/**
 * Pruebas PI-45 del panel de cajero: identificar o registrar cliente presencial.
 *
 * La búsqueda y el registro van contra la API real
 * (`GET /clientes/buscar-documento/` y `POST /clientes/presencial/`).
 * La emisión de comprobantes sigue siendo local y no se cubre acá.
 *
 * @module CashierDashboard.test
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CashierDashboard from '@/pages/cashier/CashierDashboard'

const auth = { name: 'Laura', email: 'laura@x.com', role: 'cashier' as const, avatar: '' }

function respuesta(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const ana = {
  id: 7,
  nombre: 'Ana',
  apellido: 'Barrios',
  nombre_completo: 'Ana Barrios',
  documento: '4589201',
  email: 'ana@x.com',
  telefono: '0981000000',
  tipo: 'FISICA',
  tipo_display: 'Persona física',
  categoria: 'MINORISTA',
  categoria_display: 'Minorista',
  activo: true,
  creado_en: '2026-10-01T00:00:00Z',
}

/** Backend simulado: busca por documento y valida el alta presencial. */
function mockApi() {
  return vi.fn(async (url: string, init: RequestInit = {}) => {
    const u = String(url)
    const metodo = (init.method ?? 'GET').toUpperCase()

    if (u.includes('/buscar-documento/')) {
      const doc = new URL(u, 'http://x').searchParams.get('documento') ?? ''
      if (doc === '4589201') {
        return respuesta({ encontrado: true, cliente: ana })
      }
      return respuesta({ encontrado: false, cliente: null })
    }
    if (u.includes('/clientes/presencial/') && metodo === 'POST') {
      const d = JSON.parse(String(init.body))
      if (d.documento === '4589201') {
        return respuesta({ documento: ['Ya existe un cliente registrado con este documento.'] }, 400)
      }
      if (!d.apellido || !d.telefono) {
        return respuesta({ apellido: ['Para persona física son obligatorios el nombre, el apellido, el documento y el correo.'] }, 400)
      }
      return respuesta({ ...ana, ...d, nombre_completo: `${d.nombre} ${d.apellido}`.trim() }, 201)
    }
    return respuesta({}, 404)
  })
}

describe('CashierDashboard PI-45 (cliente presencial)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockApi())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function renderCajero() {
    render(<CashierDashboard auth={auth} currentClient={null} navigate={() => {}} />)
  }

  const campoDoc = () => screen.getByPlaceholderText('Ej. 4589201')

  it('arranca sin cliente preseleccionado', () => {
    renderCajero()
    expect(screen.getByText('Sin cliente seleccionado.')).toBeInTheDocument()
    expect(screen.queryByText('✓ Cliente Seleccionado')).not.toBeInTheDocument()
  })

  it('busca por documento y muestra los datos para confirmar identidad', async () => {
    const user = userEvent.setup()
    renderCajero()
    await user.type(campoDoc(), '4589201')
    await user.click(screen.getByRole('button', { name: 'Buscar' }))

    expect(await screen.findByText('✓ Cliente Seleccionado')).toBeInTheDocument()
    expect(screen.getByText('Ana Barrios')).toBeInTheDocument()
    expect(screen.getByText('Doc: 4589201')).toBeInTheDocument()
    expect(screen.getByText('Tipo: Persona física')).toBeInTheDocument()
  })

  it('avisa que el documento no existe y ofrece registrarlo', async () => {
    const user = userEvent.setup()
    renderCajero()
    await user.type(campoDoc(), '0000000')
    await user.click(screen.getByRole('button', { name: 'Buscar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/no está registrado/i)
    expect(screen.getByRole('button', { name: /Registrar cliente/ })).toBeInTheDocument()
    expect(screen.queryByText('✓ Cliente Seleccionado')).not.toBeInTheDocument()
  })

  it('pide el documento antes de buscar', async () => {
    const user = userEvent.setup()
    renderCajero()
    await user.click(screen.getByRole('button', { name: 'Buscar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/Ingrese el número de documento/i)
  })

  it('registra un cliente y lo deja seleccionado para la operación', async () => {
    const user = userEvent.setup()
    renderCajero()
    await user.type(campoDoc(), '0000000')
    await user.click(screen.getByRole('button', { name: 'Buscar' }))
    await user.click(await screen.findByRole('button', { name: /Registrar cliente/ }))

    // El documento viaja precargado desde la búsqueda.
    expect(screen.getByLabelText('N° Documento')).toHaveValue('0000000')

    await user.type(screen.getByLabelText('Nombre'), 'Pedro')
    await user.type(screen.getByLabelText('Apellido'), 'Test')
    await user.type(screen.getByLabelText('Correo Electrónico'), 'pedro@x.com')
    await user.type(screen.getByLabelText(/Teléfono/), '0981111111')
    await user.click(screen.getByRole('button', { name: 'Guardar y Seleccionar' }))

    expect(await screen.findByText('✓ Cliente Seleccionado')).toBeInTheDocument()
    expect(screen.getByText('Pedro Test')).toBeInTheDocument()
    // El modal se cerró y la búsqueda queda con el documento del cliente nuevo.
    expect(screen.queryByText('Registro de Cliente Presencial')).not.toBeInTheDocument()
    expect(campoDoc()).toHaveValue('0000000')
  })

  it('muestra el error del backend si el documento ya está registrado', async () => {
    const user = userEvent.setup()
    renderCajero()
    await user.click(screen.getByRole('button', { name: '+ Nuevo Cliente' }))
    await user.type(screen.getByLabelText('Nombre'), 'Ana')
    await user.type(screen.getByLabelText('Apellido'), 'Barrios')
    await user.type(screen.getByLabelText('N° Documento'), '4589201')
    await user.type(screen.getByLabelText('Correo Electrónico'), 'ana@x.com')
    await user.type(screen.getByLabelText(/Teléfono/), '0981000000')
    await user.click(screen.getByRole('button', { name: 'Guardar y Seleccionar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/ya existe un cliente/i)
    expect(screen.queryByText('✓ Cliente Seleccionado')).not.toBeInTheDocument()
  })

  it('para persona jurídica no exige apellido ni teléfono', async () => {
    const user = userEvent.setup()
    renderCajero()
    await user.click(screen.getByRole('button', { name: '+ Nuevo Cliente' }))
    await user.selectOptions(screen.getByLabelText('Tipo de Cliente'), 'JURIDICA')

    expect(screen.getByLabelText('RUC')).toBeInTheDocument()
    expect(screen.getByLabelText('Apellido')).not.toBeRequired()
    expect(screen.getByLabelText(/Teléfono/)).not.toBeRequired()
  })
})