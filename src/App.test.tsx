import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from '@/App'

const keycloakMock = vi.hoisted(() => ({
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  init: vi.fn(),
  tokenParsed: null as Record<string, unknown> | null,
}))

const initKeycloakMock = vi.hoisted(() => vi.fn())

vi.mock('./keycloak', () => ({
  default: keycloakMock,
  initKeycloak: initKeycloakMock,
}))

describe('App (resolución de sesión y rol)', () => {
  beforeEach(() => {
    initKeycloakMock.mockReset()
    keycloakMock.tokenParsed = null
  })

  it('muestra el estado de carga mientras inicializa keycloak', () => {
    initKeycloakMock.mockImplementation(() => new Promise(() => {}))
    render(<App />)
    expect(screen.getByText('Cargando...')).toBeInTheDocument()
  })

  it('muestra la landing pública si el usuario no está autenticado', async () => {
    initKeycloakMock.mockResolvedValue(false)
    render(<App />)
    expect(await screen.findByRole('heading', { name: /Cambiá divisas/ })).toBeInTheDocument()
  })

  it('ingresa al dashboard como administrador cuando keycloak autentica con rol admin', async () => {
    keycloakMock.tokenParsed = {
      name: 'María García',
      email: 'maria@globalexchange.com',
      realm_access: { roles: ['admin'] },
    }
    initKeycloakMock.mockResolvedValue(true)
    render(<App />)
    expect(await screen.findByText('María')).toBeInTheDocument()
    expect(screen.getByText('Clientes')).toBeInTheDocument()
    expect(screen.getByText('Roles y Permisos')).toBeInTheDocument()
  })

  it('ingresa como analista cambiario cuando el rol es analyst', async () => {
    keycloakMock.tokenParsed = {
      name: 'Juan Analista',
      email: 'juan@globalexchange.com',
      realm_access: { roles: ['analyst'] },
    }
    initKeycloakMock.mockResolvedValue(true)
    render(<App />)
    expect(await screen.findByText('Juan')).toBeInTheDocument()
    expect(screen.getByText('Gestión de Tasas')).toBeInTheDocument()
    expect(screen.queryByText('Roles y Permisos')).not.toBeInTheDocument()
  })
})