import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Sidebar from '@/components/Sidebar'
import { type AuthUser } from '@/types'

const admin: AuthUser = { name: 'María García', email: 'maria@globalexchange.com', role: 'admin', avatar: '' }
const analyst: AuthUser = { name: 'Juan Analista', email: 'juan@globalexchange.com', role: 'analyst', avatar: '' }
const userAuth: AuthUser = { name: 'Carlos Martínez', email: 'carlos@email.com', role: 'user', avatar: '' }

function renderSidebar(auth: AuthUser, collapsed = false, currentPage = 'dashboard') {
  const navigate = vi.fn()
  const onLogout = vi.fn()
  const onToggle = vi.fn()
  render(
    <Sidebar
      auth={auth}
      currentPage={currentPage as never}
      navigate={navigate}
      onLogout={onLogout}
      collapsed={collapsed}
      onToggle={onToggle}
    />
  )
  return { navigate, onLogout, onToggle }
}

describe('Sidebar (menú lateral por rol)', () => {
  it('muestra el menú completo de usuario para el rol user', () => {
    renderSidebar(userAuth)
    for (const label of ['Dashboard', 'Billeteras', 'Comprar / Vender', 'Transacciones', 'Facturas', 'Tasas de Cambio']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
    expect(screen.queryByText('Clientes')).not.toBeInTheDocument()
    expect(screen.queryByText('Gestión de Tasas')).not.toBeInTheDocument()
  })

  it('muestra el menú de analista para el rol analyst', () => {
    renderSidebar(analyst)
    expect(screen.getByText('Gestión de Tasas')).toBeInTheDocument()
    expect(screen.getByText('Ganancias')).toBeInTheDocument()
    expect(screen.queryByText('Clientes')).not.toBeInTheDocument()
    expect(screen.queryByText('Billeteras')).not.toBeInTheDocument()
  })

  it('muestra el menú de administración para el rol admin', () => {
    renderSidebar(admin)
    for (const label of ['Clientes', 'Usuarios', 'Roles y Permisos', 'Monedas', 'Configuración', 'Reportes']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
    expect(screen.queryByText('Billeteras')).not.toBeInTheDocument()
  })

  it('navega a la página indicada al hacer clic en un ítem', async () => {
    const user = userEvent.setup()
    const { navigate } = renderSidebar(admin)
    await user.click(screen.getByText('Clientes'))
    expect(navigate).toHaveBeenCalledWith('admin-clients')
  })

  it('oculta las etiquetas cuando está colapsado y muestra tooltips', () => {
    renderSidebar(admin, true)
    expect(screen.getByTitle('Clientes')).toBeInTheDocument()
    const tooltip = screen.getByText('Clientes')
    expect(tooltip.className).toContain('opacity-0')
  })

  it('notifica el colapso al hacer clic en el botón de alternar', async () => {
    const user = userEvent.setup()
    const { onToggle } = renderSidebar(admin)
    await user.click(screen.getByRole('button', { name: 'Colapsar menú' }))
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('cierra sesión desde el perfil del usuario', async () => {
    const user = userEvent.setup()
    const { onLogout } = renderSidebar(admin)
    await user.click(screen.getByTitle('Cerrar sesión'))
    expect(onLogout).toHaveBeenCalledTimes(1)
  })
})