import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Register from '@/pages/Register'

const renderRegister = () => {
  const navigate = vi.fn()
  render(<Register navigate={navigate} />)
  return { navigate }
}

describe('Register (autoregistro y verificación por correo)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renderiza el formulario de creación de cuenta', () => {
    renderRegister()
    expect(screen.getByRole('heading', { name: 'Crear cuenta' })).toBeInTheDocument()
    expect(screen.getByText(/Persona Física/)).toBeInTheDocument()
    expect(screen.getByText(/Persona Jurídica/)).toBeInTheDocument()
  })

  it('valida los campos obligatorios al enviar vacío', async () => {
    const user = userEvent.setup()
    renderRegister()
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }))
    expect(await screen.findAllByText('Requerido')).not.toHaveLength(0)
    expect(screen.getByText('Correo inválido')).toBeInTheDocument()
    expect(screen.getByText('Mínimo 8 caracteres')).toBeInTheDocument()
    expect(screen.getByText('Debés aceptar los términos')).toBeInTheDocument()
  })

  it('rechaza un correo mal formado', async () => {
    const user = userEvent.setup()
    renderRegister()
    await user.type(screen.getByLabelText('Correo electrónico'), 'correo-invalido')
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }))
    expect(await screen.findByText('Correo inválido')).toBeInTheDocument()
  })

  it('rechaza contraseñas que no coinciden', async () => {
    const user = userEvent.setup()
    renderRegister()
    await user.type(screen.getByLabelText('Contraseña'), 'abcdefgh')
    await user.type(screen.getByLabelText('Confirmar contraseña'), 'distinta')
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }))
    expect(await screen.findByText('Las contraseñas no coinciden')).toBeInTheDocument()
  })

  it('al registrarse como persona jurídica muestra empresa y RUC en vez de apellido', async () => {
    const user = userEvent.setup()
    renderRegister()
    await user.click(screen.getByRole('button', { name: /Persona Jurídica/ }))
    expect(screen.getByText('Razón Social / Empresa')).toBeInTheDocument()
    expect(screen.getByText('RUC')).toBeInTheDocument()
    expect(screen.queryByText('Apellido')).not.toBeInTheDocument()
  })

  it('al enviar un formulario válido muestra la verificación por correo (RF1)', async () => {
    const user = userEvent.setup()
    renderRegister()
    await user.type(screen.getByLabelText('Nombre'), 'Carlos')
    await user.type(screen.getByLabelText('Apellido'), 'Martínez')
    await user.type(screen.getByLabelText('Correo electrónico'), 'carlos@email.com')
    await user.type(screen.getByLabelText('Teléfono'), '+595 981 000 000')
    await user.type(screen.getByLabelText('Cédula de identidad'), '1.234.567-8')
    await user.type(screen.getByLabelText('Contraseña'), 'claveSegura12')
    await user.type(screen.getByLabelText('Confirmar contraseña'), 'claveSegura12')
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }))
    expect(await screen.findByText('Verificá tu correo electrónico', {}, { timeout: 4000 })).toBeInTheDocument()
    expect(screen.getByText('carlos@email.com')).toBeInTheDocument()
  })

  it('permite ir al login desde el registro', async () => {
    const user = userEvent.setup()
    const { navigate } = renderRegister()
    await user.click(screen.getByRole('button', { name: /Iniciar sesión/ }))
    expect(navigate).toHaveBeenCalledWith('login')
  })
})