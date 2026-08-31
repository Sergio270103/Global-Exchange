import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Clients from '@/pages/admin/Clients'

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
  it('muestra las tarjetas de resumen, el buscador y la tabla inicial', () => {
    render(<Clients />)
    expect(screen.getByText('Total clientes')).toBeInTheDocument()
    expect(screen.getByText('Carlos Martínez')).toBeInTheDocument()
    expect(screen.getByText('Corporación Atlas S.A.')).toBeInTheDocument()
    expect(screen.getAllByText('Minorista').length).toBeGreaterThan(0)
    expect(screen.getAllByText('VIP').length).toBeGreaterThan(0)
    expect(screen.getByPlaceholderText('Buscar cliente...')).toBeInTheDocument()
  })

  it('filtra clientes por texto de búsqueda', async () => {
    const user = userEvent.setup()
    render(<Clients />)
    await user.type(screen.getByPlaceholderText('Buscar cliente...'), 'atlas')
    expect(screen.getByText('Corporación Atlas S.A.')).toBeInTheDocument()
    expect(screen.queryByText('Carlos Martínez')).not.toBeInTheDocument()
  })

  it('filtra clientes por categoría', async () => {
    const user = userEvent.setup()
    render(<Clients />)
    await user.selectOptions(screen.getAllByRole('combobox')[0], 'VIP')
    expect(screen.getByText('Ana López')).toBeInTheDocument()
    expect(screen.getByText('Laura Díaz')).toBeInTheDocument()
    expect(screen.queryByText('Carlos Martínez')).not.toBeInTheDocument()
  })

  it('crea un nuevo cliente y lo agrega a la tabla', async () => {
    const user = userEvent.setup()
    render(<Clients />)
    await createClient(user, 'Nueva Empresa S.A.')
    expect(screen.getByText('Nueva Empresa S.A.')).toBeInTheDocument()
    expect(screen.getByText('nuevo@email.com')).toBeInTheDocument()
    expect(screen.queryByText('Nuevo cliente')).not.toBeInTheDocument()
  })

  it('edita un cliente existente', async () => {
    const user = userEvent.setup()
    render(<Clients />)
    await user.click(within(rowFor('Carlos Martínez')).getByRole('button', { name: 'Editar' }))
    expect(screen.getByText('Editar cliente')).toBeInTheDocument()
    const nameInput = screen.getByLabelText('Nombre / Razón Social')
    await user.clear(nameInput)
    await user.type(nameInput, 'Carlos Editado')
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    expect(screen.getByText('Carlos Editado')).toBeInTheDocument()
    expect(screen.queryByText('Carlos Martínez')).not.toBeInTheDocument()
  })

  it('elimina un cliente tras confirmar en el diálogo', async () => {
    const user = userEvent.setup()
    render(<Clients />)
    await user.click(within(rowFor('Ana López')).getByRole('button', { name: 'Eliminar' }))
    expect(screen.getByText('Eliminar cliente')).toBeInTheDocument()
    const confirm = screen.getAllByRole('button', { name: 'Eliminar' })
      .find(b => b.className.includes('bg-red-500'))!
    await user.click(confirm)
    expect(screen.queryByText('Ana López')).not.toBeInTheDocument()
  })
})