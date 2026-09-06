import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Users from '@/pages/admin/Users'

function rowFor(name: string): HTMLElement {
  return screen.getByText(name, { selector: 'div' }).closest('tr')!
}

describe('Users (CRUD de usuarios admin)', () => {
  it('muestra las tarjetas de resumen y la tabla inicial', () => {
    render(<Users />)
    expect(screen.getByText('Total usuarios')).toBeInTheDocument()
    expect(screen.getByText('María García')).toBeInTheDocument()
    expect(screen.getByText('Juan Analista')).toBeInTheDocument()
  })

  it('filtra usuarios por rol', async () => {
    const user = userEvent.setup()
    render(<Users />)
    await user.selectOptions(screen.getAllByRole('combobox')[0], 'Administrador')
    expect(screen.getByText('María García')).toBeInTheDocument()
    expect(screen.queryByText('Juan Analista')).not.toBeInTheDocument()
  })

  it('crea un nuevo usuario y lo agrega a la tabla', async () => {
    const user = userEvent.setup()
    render(<Users />)
    await user.click(screen.getByRole('button', { name: /Nuevo usuario/ }))
    await user.type(screen.getByLabelText('Nombre completo'), 'Nuevo Empleado')
    await user.type(screen.getByLabelText('Correo electrónico'), 'empleado@globalexchange.com')
    await user.selectOptions(screen.getByLabelText('Rol'), 'Analista Cambiario')
    await user.selectOptions(screen.getByLabelText('Cliente'), 'Global Exchange')
    await user.click(screen.getByRole('button', { name: 'Crear usuario' }))
    expect(screen.queryByText('Nuevo usuario')).not.toBeInTheDocument()
    expect(screen.getByText('Nuevo Empleado')).toBeInTheDocument()
    expect(within(rowFor('Nuevo Empleado')).getByText('Analista Cambiario')).toBeInTheDocument()
  })

  it('edita un usuario existente', async () => {
    const user = userEvent.setup()
    render(<Users />)
    await user.click(within(rowFor('María García')).getByRole('button', { name: 'Editar' }))
    expect(screen.getByText('Editar usuario')).toBeInTheDocument()
    const nameInput = screen.getByLabelText('Nombre completo')
    await user.clear(nameInput)
    await user.type(nameInput, 'María García Ed.')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(screen.getByText('María García Ed.')).toBeInTheDocument()
    expect(screen.queryByText('María García')).not.toBeInTheDocument()
  })

  it('alterna el estado Activo/Suspendido de un usuario', async () => {
    const user = userEvent.setup()
    render(<Users />)
    const pedroRow = rowFor('Pedro Silva')
    await user.click(within(pedroRow).getByRole('button', { name: 'Suspendido' }))
    expect(within(pedroRow).getByRole('button', { name: 'Activo' })).toBeInTheDocument()
  })

  it('elimina un usuario de la tabla', async () => {
    const user = userEvent.setup()
    render(<Users />)
    await user.click(within(rowFor('Ana López')).getByRole('button', { name: 'Eliminar' }))
    expect(screen.queryByText('Ana López')).not.toBeInTheDocument()
  })
})