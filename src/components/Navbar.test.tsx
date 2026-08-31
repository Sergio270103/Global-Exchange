import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Navbar from '@/components/Navbar'
import { type AuthUser } from '@/types'

const admin: AuthUser = { name: 'María García', email: 'maria@globalexchange.com', role: 'admin', avatar: '' }
const userAuth: AuthUser = { name: 'Carlos Martínez', email: 'carlos@email.com', role: 'user', avatar: '' }

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
      currentClient="Carlos Martínez"
      setCurrentClient={setCurrentClient}
    />
  )
  return { navigate, onLogout, setCurrentClient }
}

type NavbarPage = 'dashboard' | 'admin-clients'

describe('Navbar (barra superior)', () => {
  it('muestra el título de la página actual según la ruta', () => {
    renderNavbar(admin)
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
  })

  it('muestra el título de gestión de clientes en ruta admin', () => {
    renderNavbar(admin, 'admin-clients')
    expect(screen.getByText('Gestión de Clientes')).toBeInTheDocument()
  })

  it('muestra el contador de notificaciones no leídas y permite marcarlas como leídas', async () => {
    const user = userEvent.setup()
    renderNavbar()
    expect(screen.getByText('2')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Notificaciones/ }))
    expect(screen.getByText('Marcar todas como leídas')).toBeInTheDocument()
    expect(screen.getByText('Variación significativa en USD')).toBeInTheDocument()
    await user.click(screen.getByText('Marcar todas como leídas'))
    expect(screen.queryByText('2')).not.toBeInTheDocument()
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
    expect(setCurrentClient).toHaveBeenCalledWith('Ana López')
  })

  it('no muestra el selector de cliente para el rol admin', () => {
    renderNavbar(admin)
    expect(screen.queryByRole('button', { name: 'Cambiar cliente' })).not.toBeInTheDocument()
  })

  it('muestra el rol del usuario en el perfil', () => {
    renderNavbar(admin)
    expect(screen.getByText('Administrador')).toBeInTheDocument()
  })
})