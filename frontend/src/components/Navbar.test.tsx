import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Navbar from '@/components/Navbar'
import Notifications from '@/pages/Notifications'
import { historialDisparos } from '@/services/alertas'
import { apiFetch } from '@/services/api'
import { type AuthUser } from '@/types'

vi.mock('@/services/api', async importOriginal => ({
  ...await importOriginal<typeof import('@/services/api')>(),
  apiFetch: vi.fn(),
}))

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

const admin: AuthUser = { name: 'María García', email: 'maria@globalexchange.com', role: 'admin', avatar: '' }
const userAuth: AuthUser = { name: 'Carlos Martínez', email: 'carlos@email.com', role: 'user', avatar: '' }
const userJuridica: AuthUser = { name: 'Ana López', email: 'ana@email.com', role: 'user', avatar: '', tipoPersona: 'Persona Jurídica' }

function renderNavbar(auth: AuthUser = admin, currentPage: string = 'dashboard') {
  const navigate = vi.fn()
  const onLogout = vi.fn()
  const setCurrentClient = vi.fn()
  render(
    <Navbar
      auth={auth}
      currentPage={currentPage as NavbarPage}
      navigate={navigate}
      onLogout={onLogout}
      currentClient={{ id: 1, nombre: 'Carlos Martínez' }}
      setCurrentClient={setCurrentClient}
    />
  )
  return { navigate, onLogout, setCurrentClient }
}

type NavbarPage = 'dashboard' | 'admin-clients'

describe('Navbar (barra superior)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  vi.mocked(apiFetch).mockResolvedValue(null)
    localStorage.clear()
    vi.mocked(historialDisparos).mockResolvedValue([])
  })
  it('muestra el título de la página actual según la ruta', () => {
    renderNavbar(admin)
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
  })

  it('muestra el título de gestión de clientes en ruta admin', () => {
    renderNavbar(admin, 'admin-clients')
    expect(screen.getByText('Gestión de Clientes')).toBeInTheDocument()
  })

  it('muestra disparos reales en la campanita y permite marcarlos como leídos', async () => {
    vi.mocked(historialDisparos).mockResolvedValue([
      { id: 4, alerta: 1, moneda_codigo: 'USD', tasa_alcanzada: 7550, umbral: 7500, direccion: 'supera', creado: '2026-10-10T11:00:00Z' },
    ] as never)
    const user = userEvent.setup()
    renderNavbar()
    expect(await screen.findByText('1')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Notificaciones/ }))
    expect(await screen.findByText('Alerta ejecutada: USD/PYG')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('1')).not.toBeInTheDocument())
    expect(apiFetch).toHaveBeenCalledWith('/alertas/historial/leer/', {
      method: 'PATCH', body: JSON.stringify({ ids: [4] }),
    })
  })

  it('actualiza la campanita al leer o eliminar desde Notificaciones', async () => {
    vi.mocked(historialDisparos).mockResolvedValue([
      { id: 4, alerta: 1, moneda_codigo: 'USD', tasa_alcanzada: 7550, umbral: 7500, direccion: 'supera', creado: '2026-10-10T11:00:00Z', leido: false, eliminado: false },
      { id: 5, alerta: 2, moneda_codigo: 'EUR', tasa_alcanzada: 7950, umbral: 8000, direccion: 'baja', creado: '2026-10-10T12:00:00Z', leido: false, eliminado: false },
    ])
    const user = userEvent.setup()
    renderNavbar()
    render(<Notifications />)
    const campana = screen.getByRole('button', { name: 'Notificaciones' })
    await waitFor(() => expect(campana).toHaveTextContent('2'))
    await user.click((await screen.findAllByRole('button', { name: 'Marcar como leída' }))[0])
    await waitFor(() => expect(campana).toHaveTextContent('1'))
    await user.click((await screen.findAllByRole('button', { name: 'Eliminar' }))[1])
    await waitFor(() => expect(campana).toHaveTextContent(/^$/))
  })

  it('muestra "Sin notificaciones" cuando no hay disparos', async () => {
    const user = userEvent.setup()
    renderNavbar()
    await user.click(screen.getByRole('button', { name: /Notificaciones/ }))
    expect(await screen.findByText('🔔 Sin notificaciones')).toBeInTheDocument()
  })

  it('navega al historial completo desde el panel de notificaciones', async () => {
    const user = userEvent.setup()
    const { navigate } = renderNavbar()
    await user.click(screen.getByRole('button', { name: /Notificaciones/ }))
    await user.click(screen.getByText('Ver todas las notificaciones'))
    expect(navigate).toHaveBeenCalledWith('notifications')
  })

  it('cierra sesión desde el menú del perfil', async () => {
    const user = userEvent.setup()
    const { onLogout } = renderNavbar()
    await user.click(screen.getByRole('button', { name: 'Perfil de usuario' }))
    await user.click(screen.getByText('Cerrar sesión'))
    expect(onLogout).toHaveBeenCalledTimes(1)
  })

  it('muestra el selector de cliente solo para el rol user y permite cambiarlo', async () => {
    const user = userEvent.setup()
    const { setCurrentClient } = renderNavbar(userAuth)
    expect(screen.getByText('Carlos Martínez')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cambiar cliente' }))
    await user.click(screen.getByText('Ana López'))
    expect(setCurrentClient).toHaveBeenCalledWith(expect.objectContaining({ nombre: 'Ana López' }))
  })

  it('no muestra el selector de cliente para el rol admin', () => {
    renderNavbar(admin)
    expect(screen.queryByRole('button', { name: 'Cambiar cliente' })).not.toBeInTheDocument()
  })

  it('muestra el tipo de persona del usuario en el selector de cliente', async () => {
    const user = userEvent.setup()
    renderNavbar(userJuridica)
    expect(screen.getByText('Persona Jurídica')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cambiar cliente' }))
    expect(screen.getByText('Tipo de persona: Persona Jurídica')).toBeInTheDocument()
  })

  it('no muestra tipo de persona si el usuario no lo tiene definido', () => {
    renderNavbar(userAuth)
    expect(screen.queryByText('Persona Jurídica')).not.toBeInTheDocument()
  })

  it('muestra el rol del usuario en el perfil', () => {
    renderNavbar(admin)
    expect(screen.getByText('Administrador')).toBeInTheDocument()
  })
})