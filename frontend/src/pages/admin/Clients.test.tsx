import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Clients from '@/pages/admin/Clients'

let clientes = [
  { id: 1, nombre: 'Carlos Martínez', documento: '12.345.678-9', email: 'carlos@email.com', tipo: 'FISICA', categoria: 'MINORISTA', activo: true, creado_en: '2023-03-01T00:00:00Z' },
  { id: 2, nombre: 'Corporación Atlas S.A.', documento: '80-012345-6', email: 'contacto@atlas.com', tipo: 'JURIDICA', categoria: 'CORPORATIVO', activo: true, creado_en: '2022-01-01T00:00:00Z' },
  { id: 3, nombre: 'Ana López', documento: '23.456.789-0', email: 'ana@email.com', tipo: 'FISICA', categoria: 'VIP', activo: true, creado_en: '2022-06-01T00:00:00Z' },
  { id: 4, nombre: 'Laura Díaz', documento: '45.678.901-2', email: 'laura@email.com', tipo: 'FISICA', categoria: 'VIP', activo: true, creado_en: '2022-09-01T00:00:00Z' },
]

const asociaciones = [
  { id: 1, cliente: 1, cliente_nombre: 'Carlos Martínez', keycloak_id: 'sub-1', username: 'carlos', email: 'carlos@email.com' },
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
    if (url.includes('/asociaciones/')) return respuesta(asociaciones)
    if (url.includes('/clientes/')) {
      if (method === 'GET') return respuesta(clientes)
      const cuerpo = JSON.parse(String(init.body ?? '{}'))
      if (method === 'POST') {
        const nuevo = { id: 99, creado_en: new Date().toISOString(), activo: true, tipo: 'FISICA', ...cuerpo }
        clientes = [...clientes, nuevo]
        return respuesta(nuevo, 201)
      }
      const id = Number(url.match(/clientes\/(\d+)\//)?.[1])
      const actual = clientes.find(c => c.id === id) ?? clientes[0]
      if (method === 'DELETE') {
        clientes = clientes.filter(c => c.id !== id)
        return respuesta({ ...actual, activo: false })
      }
      const actualizado = { ...actual, ...cuerpo }
      clientes = clientes.map(c => (c.id === id ? actualizado : c))
      return respuesta(actualizado)
    }
    return respuesta([])
  })
}

function rowFor(name: string): HTMLElement {
  return screen.getByText(name).closest('tr')!
}

async function createClient(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole('button', { name: /Nuevo cliente/ }))
  await user.type(screen.getByLabelText('Nombre / Razón Social'), name)
  await user.type(screen.getByLabelText('Correo electrónico'), 'nuevo@email.com')
  await user.type(screen.getByLabelText('Documento / RUC'), '80-000000-1')
  await user.selectOptions(screen.getByLabelText('Categoría'), 'Corporativo')
  await user.click(screen.getByRole('button', { name: 'Crear cliente' }))
}

describe('Clients (CRUD de clientes admin)', () => {
  beforeEach(() => {
    clientes = [
      { id: 1, nombre: 'Carlos Martínez', documento: '12.345.678-9', email: 'carlos@email.com', tipo: 'FISICA', categoria: 'MINORISTA', activo: true, creado_en: '2023-03-01T00:00:00Z' },
      { id: 2, nombre: 'Corporación Atlas S.A.', documento: '80-012345-6', email: 'contacto@atlas.com', tipo: 'JURIDICA', categoria: 'CORPORATIVO', activo: true, creado_en: '2022-01-01T00:00:00Z' },
      { id: 3, nombre: 'Ana López', documento: '23.456.789-0', email: 'ana@email.com', tipo: 'FISICA', categoria: 'VIP', activo: true, creado_en: '2022-06-01T00:00:00Z' },
      { id: 4, nombre: 'Laura Díaz', documento: '45.678.901-2', email: 'laura@email.com', tipo: 'FISICA', categoria: 'VIP', activo: true, creado_en: '2022-09-01T00:00:00Z' },
    ]
    vi.stubGlobal('fetch', mockFetch())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('muestra las tarjetas de resumen, el buscador y la tabla inicial', async () => {
    render(<Clients />)
    expect(await screen.findByText('Total clientes')).toBeInTheDocument()
    expect(screen.getByText('Carlos Martínez')).toBeInTheDocument()
    expect(screen.getByText('Corporación Atlas S.A.')).toBeInTheDocument()
    expect(screen.getAllByText('Minorista').length).toBeGreaterThan(0)
    expect(screen.getAllByText('VIP').length).toBeGreaterThan(0)
    expect(screen.getByPlaceholderText('Buscar cliente...')).toBeInTheDocument()
  })

  it('filtra clientes por texto de búsqueda', async () => {
    const user = userEvent.setup()
    render(<Clients />)
    await screen.findByText('Carlos Martínez')
    await user.type(screen.getByPlaceholderText('Buscar cliente...'), 'atlas')
    expect(screen.getByText('Corporación Atlas S.A.')).toBeInTheDocument()
    expect(screen.queryByText('Carlos Martínez')).not.toBeInTheDocument()
  })

  it('filtra clientes por categoría', async () => {
    const user = userEvent.setup()
    render(<Clients />)
    await screen.findByText('Carlos Martínez')
    await user.selectOptions(screen.getAllByRole('combobox')[0], 'VIP')
    expect(screen.getByText('Ana López')).toBeInTheDocument()
    expect(screen.getByText('Laura Díaz')).toBeInTheDocument()
    expect(screen.queryByText('Carlos Martínez')).not.toBeInTheDocument()
  })

  it('crea un nuevo cliente y lo agrega a la tabla', async () => {
    const user = userEvent.setup()
    render(<Clients />)
    await screen.findByText('Carlos Martínez')
    await createClient(user, 'Nueva Empresa S.A.')
    expect(await screen.findByText('Nueva Empresa S.A.')).toBeInTheDocument()
    expect(screen.getByText('nuevo@email.com')).toBeInTheDocument()
    expect(screen.queryByText('Nuevo cliente')).not.toBeInTheDocument()
  })

  it('edita un cliente existente', async () => {
    const user = userEvent.setup()
    render(<Clients />)
    await screen.findByText('Carlos Martínez')
    await user.click(within(rowFor('Carlos Martínez')).getByRole('button', { name: 'Editar' }))
    expect(screen.getByText('Editar cliente')).toBeInTheDocument()
    const nameInput = screen.getByLabelText('Nombre / Razón Social')
    await user.clear(nameInput)
    await user.type(nameInput, 'Carlos Editado')
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    expect(await screen.findByText('Carlos Editado')).toBeInTheDocument()
    expect(screen.queryByText('Carlos Martínez')).not.toBeInTheDocument()
  })

  it('elimina un cliente tras confirmar en el diálogo', async () => {
    const user = userEvent.setup()
    render(<Clients />)
    await screen.findByText('Ana López')
    await user.click(within(rowFor('Ana López')).getByRole('button', { name: 'Eliminar' }))
    expect(screen.getByText('Eliminar cliente')).toBeInTheDocument()
    const confirm = screen.getAllByRole('button', { name: 'Eliminar' })
      .find(b => b.className.includes('bg-red-500'))!
    await user.click(confirm)
    expect(screen.queryByText('Ana López')).not.toBeInTheDocument()
  })
})
