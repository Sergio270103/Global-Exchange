import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Users from '@/pages/admin/Users'

let asocs = [
  { id: 1, cliente: 1, cliente_nombre: 'Carlos Martínez', keycloak_id: 'sub-carlos-1', username: 'Carlos Martínez', email: 'carlos@email.com' },
  { id: 2, cliente: 2, cliente_nombre: 'Corporación Atlas S.A.', keycloak_id: 'sub-ana-2', username: 'Ana López', email: 'ana@email.com' },
]

const clientes = [
  { id: 1, nombre: 'Carlos Martínez', documento: '1', email: 'carlos@email.com', tipo: 'FISICA', categoria: 'MINORISTA', activo: true, creado_en: '' },
  { id: 2, nombre: 'Corporación Atlas S.A.', documento: '2', email: 'contacto@atlas.com', tipo: 'JURIDICA', categoria: 'CORPORATIVO', activo: true, creado_en: '' },
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
    if (url.includes('/asociaciones/')) {
      if (method === 'GET') return respuesta(asocs)
      if (method === 'POST') {
        const cuerpo = JSON.parse(String(init.body ?? '{}'))
        const cliente = clientes.find(c => c.id === Number(cuerpo.cliente))
        const nueva = { id: 99, cliente_nombre: cliente?.nombre ?? '', ...cuerpo }
        asocs = [...asocs, nueva]
        return respuesta(nueva, 201)
      }
      const id = Number(url.match(/asociaciones\/(\d+)\//)?.[1])
      asocs = asocs.filter(a => a.id !== id)
      return respuesta({})
    }
    return respuesta([])
  })
}

describe('Users (asociaciones usuario-cliente)', () => {
  beforeEach(() => {
    asocs = [
      { id: 1, cliente: 1, cliente_nombre: 'Carlos Martínez', keycloak_id: 'sub-carlos-1', username: 'Carlos Martínez', email: 'carlos@email.com' },
      { id: 2, cliente: 2, cliente_nombre: 'Corporación Atlas S.A.', keycloak_id: 'sub-ana-2', username: 'Ana López', email: 'ana@email.com' },
    ]
    vi.stubGlobal('fetch', mockFetch())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('muestra las tarjetas de resumen y la tabla inicial', async () => {
    render(<Users />)
    expect(await screen.findByText('Usuarios asociados')).toBeInTheDocument()
    expect(screen.getAllByText('Carlos Martínez').length).toBeGreaterThan(0)
    expect(screen.getByText('ana@email.com')).toBeInTheDocument()
    expect(screen.getByText(/cuentas de acceso y los roles se administran en/)).toBeInTheDocument()
  })

  it('filtra asociaciones por texto de búsqueda', async () => {
    const user = userEvent.setup()
    render(<Users />)
    await screen.findByText('carlos@email.com')
    await user.type(screen.getByPlaceholderText('Buscar usuario...'), 'ana@email')
    expect(screen.getByText('ana@email.com')).toBeInTheDocument()
    expect(screen.queryByText('carlos@email.com')).not.toBeInTheDocument()
  })

  it('asocia un usuario nuevo a un cliente', async () => {
    const user = userEvent.setup()
    render(<Users />)
    await screen.findByText('carlos@email.com')
    await user.click(screen.getByRole('button', { name: /Asociar usuario/ }))
    await user.selectOptions(screen.getByLabelText('Cliente'), '1')
    await user.type(screen.getByLabelText('Sub de Keycloak'), 'sub-nuevo-3')
    await user.type(screen.getByLabelText('Nombre de usuario'), 'Nuevo Empleado')
    await user.type(screen.getByLabelText('Correo electrónico'), 'empleado@globalexchange.com')
    await user.click(screen.getByRole('button', { name: 'Asociar' }))
    expect(await screen.findByText('Nuevo Empleado')).toBeInTheDocument()
    expect(screen.getByText('empleado@globalexchange.com')).toBeInTheDocument()
  })

  it('desvincula un usuario tras confirmar en el diálogo', async () => {
    const user = userEvent.setup()
    render(<Users />)
    await screen.findByText('ana@email.com')
    const filas = screen.getAllByRole('row')
    const filaAna = filas.find(f => f.textContent?.includes('ana@email.com'))!
    await user.click(within(filaAna).getByRole('button', { name: 'Desvincular' }))
    expect(screen.getByText('Desvincular usuario')).toBeInTheDocument()
    const confirm = screen.getAllByRole('button', { name: 'Desvincular' })
      .find(b => b.className.includes('bg-red-500'))!
    await user.click(confirm)
    expect(screen.queryByText('ana@email.com')).not.toBeInTheDocument()
  })
})

