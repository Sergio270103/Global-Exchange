/**
 * Pruebas PI-72 del layout autenticado (sidebar + navbar + contenido).
 *
 * @module Layout.test
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import Layout from '@/components/Layout'

const auth = { name: 'María García', email: 'maria@x.com', role: 'admin' as const, avatar: '' }

describe('Layout (shell autenticado)', () => {
  it('renderiza sidebar, navbar y contenido', () => {
    render(
      <Layout
        auth={auth}
        currentPage="dashboard"
        navigate={vi.fn()}
        onLogout={vi.fn()}
        currentClient={{ id: 1, nombre: 'Carlos' }}
        setCurrentClient={vi.fn()}
      >
        <div>Contenido de prueba</div>
      </Layout>,
    )
    expect(screen.getByText('Contenido de prueba')).toBeInTheDocument()
    expect(screen.getByText('Clientes')).toBeInTheDocument()
    expect(screen.getAllByText('Dashboard').length).toBeGreaterThan(0)
  })
})
