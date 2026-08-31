import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RolesPermissions from '@/pages/admin/RolesPermissions'

function rowFor(permission: string): HTMLElement {
  return screen.getByText(permission).closest('tr')!
}

function analystToggle(row: HTMLElement): HTMLElement {
  return within(row).getAllByRole('button')[1]
}

describe('RolesPermissions (matriz de roles y permisos)', () => {
  it('muestra la matriz con los 4 roles y sus permisos iniciales', () => {
    render(<RolesPermissions />)
    expect(screen.getByText('Matriz de roles y permisos')).toBeInTheDocument()
    for (const role of ['Administrador', 'Analista Cambiario', 'Usuario', 'No Registrado']) {
      expect(screen.getAllByText(role).length).toBeGreaterThan(0)
    }
    expect(screen.getByText('Comprar divisas')).toBeInTheDocument()
    expect(screen.getByText('20 / 20 permisos activos')).toBeInTheDocument()
    expect(screen.getByText('7 / 20 permisos activos')).toBeInTheDocument()
  })

  it('no permite modificar el permiso de administrador (queda en 20/20)', async () => {
    const user = userEvent.setup()
    render(<RolesPermissions />)
    const row = rowFor('Comprar divisas')
    const adminToggle = within(row).getAllByRole('button')[0]
    expect(adminToggle).toBeDisabled()
    expect(screen.getByText('20 / 20 permisos activos')).toBeInTheDocument()
  })

  it('activa un permiso para el analista y actualiza el contador a 8/20', async () => {
    const user = userEvent.setup()
    render(<RolesPermissions />)
    await user.click(analystToggle(rowFor('Comprar divisas')))
    expect(screen.getByText('8 / 20 permisos activos')).toBeInTheDocument()
  })

  it('guarda los cambios y muestra confirmación', async () => {
    const user = userEvent.setup()
    render(<RolesPermissions />)
    await user.click(screen.getByRole('button', { name: /Guardar permisos/ }))
    expect(await screen.findByText('✓ Cambios guardados', {}, { timeout: 3000 })).toBeInTheDocument()
  })
})