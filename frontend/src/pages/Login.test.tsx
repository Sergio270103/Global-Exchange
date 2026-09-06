import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Login from '@/pages/Login'

const renderLogin = () => {
  const navigate = vi.fn()
  const onLogin = vi.fn()
  render(<Login navigate={navigate} onLogin={onLogin} />)
  return { navigate, onLogin }
}

describe('Login (autenticación y login para todos los roles)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renderiza el formulario de inicio de sesión', () => {
    renderLogin()
    expect(screen.getByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument()
    expect(screen.getByLabelText('Correo electrónico')).toBeInTheDocument()
    expect(screen.getByLabelText('Contraseña')).toBeInTheDocument()
  })

  it('muestra error al enviar el formulario vacío', async () => {
    const user = userEvent.setup()
    renderLogin()
    await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }))
    expect(await screen.findByText('Completá todos los campos')).toBeInTheDocument()
    expect(screen.getByLabelText('Correo electrónico')).toHaveValue('')
  })

  it('llama a onLogin con el rol user al ingresar credenciales', async () => {
    const user = userEvent.setup()
    const { onLogin } = renderLogin()
    await user.type(screen.getByLabelText('Correo electrónico'), 'carlos@email.com')
    await user.type(screen.getByLabelText('Contraseña'), 'secret123')
    await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }))
    await waitFor(() => expect(onLogin).toHaveBeenCalledTimes(1))
    expect(onLogin).toHaveBeenCalledWith(expect.objectContaining({ email: 'carlos@email.com', role: 'user' }))
  })

  it('permiten el acceso rápido con cuenta de administrador (quick login)', async () => {
    const user = userEvent.setup()
    const { onLogin } = renderLogin()
    await user.click(screen.getAllByRole('button', { name: /María García/ })[0])
    await waitFor(() => expect(onLogin).toHaveBeenCalledTimes(1))
    expect(onLogin).toHaveBeenCalledWith(expect.objectContaining({ role: 'admin' }))
  })

  it('permiten el acceso rápido con cuenta de analista', async () => {
    const user = userEvent.setup()
    const { onLogin } = renderLogin()
    await user.click(screen.getAllByRole('button', { name: /Juan Analista/ })[0])
    await waitFor(() => expect(onLogin).toHaveBeenCalledTimes(1))
    expect(onLogin).toHaveBeenCalledWith(expect.objectContaining({ role: 'analyst' }))
  })

  it('navega al registro al hacer clic en Registrarse gratis', async () => {
    const user = userEvent.setup()
    const { navigate } = renderLogin()
    await user.click(screen.getByRole('button', { name: /Registrarse gratis/ }))
    expect(navigate).toHaveBeenCalledWith('register')
  })

  it('permite mostrar/ocultar la contraseña', async () => {
    const user = userEvent.setup()
    renderLogin()
    const password = screen.getByLabelText('Contraseña')
    expect(password).toHaveAttribute('type', 'password')
    await user.click(screen.getByRole('button', { name: 'Mostrar' }))
    expect(password).toHaveAttribute('type', 'text')
  })
})