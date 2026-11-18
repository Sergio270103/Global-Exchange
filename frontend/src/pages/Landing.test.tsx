import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import keycloak from '../keycloak'
import Landing from '@/pages/Landing'
import { cotizacionesPublicas } from '@/services/cotizaciones'

vi.mock('@/services/cotizaciones', () => ({ cotizacionesPublicas: vi.fn() }))
const tasas = [
  { id: 1, moneda: 'USD', nombre: 'Dólar', flag: '🇺🇸', compra: 7400, venta: 7500, vigente_desde: '2026-11-17T10:00:00Z', creado_por: '' },
  { id: 2, moneda: 'EUR', nombre: 'Euro', flag: '🇪🇺', compra: 8000, venta: 8200, vigente_desde: '2026-11-17T10:00:00Z', creado_por: '' },
]

vi.mock('../keycloak', () => ({
  default: { login: vi.fn(), register: vi.fn(), logout: vi.fn(), init: vi.fn() },
}))

const keycloakMock = keycloak as unknown as { login: ReturnType<typeof vi.fn>; register: ReturnType<typeof vi.fn> }

describe('Landing (página pública)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(cotizacionesPublicas).mockResolvedValue(tasas)
    Element.prototype.scrollIntoView = vi.fn()
  })

  it('muestra el titular principal y navegación pública', () => {
    render(<Landing navigate={() => {}} />)
    expect(screen.getByRole('heading', { name: /Cambiá divisas/ })).toBeInTheDocument()
    expect(screen.getByText('Simulador de conversión')).toBeInTheDocument()
    expect(screen.getByText('Preguntas frecuentes')).toBeInTheDocument()
  })

  it('calcula la conversión en el simulador con el monto ingresado', async () => {
    const user = userEvent.setup()
    render(<Landing navigate={() => {}} />)
    const amount = screen.getByDisplayValue('1000')
    await user.clear(amount)
    await user.type(amount, '2000')
    const simButton = screen.getAllByRole('button', { name: 'Simular conversión' })
      .find(b => b.closest('section#simulator'))!
    await waitFor(() => expect(simButton).toBeEnabled())
    await user.click(simButton)
    expect(await screen.findByText('Total a recibir')).toBeInTheDocument()
    expect(screen.getByText('14.800.000 PYG')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Comprar ahora →' })).toBeInTheDocument()
  })

  it('despliega la respuesta de una pregunta frecuente', async () => {
    const user = userEvent.setup()
    render(<Landing navigate={() => {}} />)
    const faq = screen.getByRole('button', { name: /¿Cómo funciona el proceso de compra\?/ })
    await user.click(faq)
    expect(screen.getByText(/Seleccionás la divisa que deseás comprar/)).toBeInTheDocument()
  })

  it('llama a keycloak.login desde Iniciar sesión', async () => {
    const user = userEvent.setup()
    render(<Landing navigate={() => {}} />)
    await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }))
    expect(keycloakMock.login).toHaveBeenCalled()
  })

  it('llama a keycloak.register desde Registrarse', async () => {
    const user = userEvent.setup()
    render(<Landing navigate={() => {}} />)
    await user.click(screen.getByRole('button', { name: 'Registrarse' }))
    expect(keycloakMock.register).toHaveBeenCalled()
  })

  it('llama a keycloak.register desde el botón de CTA del hero', async () => {
    const user = userEvent.setup()
    render(<Landing navigate={() => {}} />)
    await user.click(screen.getByRole('button', { name: /Empezar ahora →/ }))
    expect(keycloakMock.register).toHaveBeenCalled()
  })

  it('muestra las tasas de cambio principales en el ticker y la sección de tasas', async () => {
    render(<Landing navigate={() => {}} />)
    await screen.findAllByText('₲ 7,500')
    expect(screen.getAllByText('USD').length).toBeGreaterThan(0)
    expect(screen.getByText('Tasas de cambio en tiempo real')).toBeInTheDocument()
  })
  it('convierte PYG a una divisa con su tasa de venta', async () => {
    const user = userEvent.setup()
    render(<Landing navigate={() => {}} />)
    await screen.findAllByText('₲ 7,500')
    const [origen, destino] = screen.getAllByRole('combobox')
    await user.selectOptions(origen, 'PYG')
    await user.selectOptions(destino, 'USD')
    const monto = screen.getByDisplayValue('1000')
    await user.clear(monto)
    await user.type(monto, '15000')
    const boton = screen.getAllByRole('button', { name: 'Simular conversión' }).find(b => b.closest('section#simulator'))!
    await user.click(boton)
    expect(screen.getByText('2 USD')).toBeInTheDocument()
  })

  it('muestra el error sin tasas de ejemplo cuando la API falla', async () => {
    vi.mocked(cotizacionesPublicas).mockRejectedValue(new Error('API caída'))
    render(<Landing navigate={() => {}} />)
    expect((await screen.findAllByText(/No se pudieron cargar las tasas/)).length).toBeGreaterThan(0)
    const boton = screen.getAllByRole('button', { name: 'Simular conversión' }).find(b => b.closest('section#simulator'))!
    expect(boton).toBeDisabled()
    expect(screen.queryByText('₲ 7,650')).toBeNull()
  })

})