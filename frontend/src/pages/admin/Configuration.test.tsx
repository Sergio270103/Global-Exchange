/**
 * Pruebas PI-72 de configuración (tabs + ajustes de precio contra API).
 *
 * @module Configuration.test
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Configuration from '@/pages/admin/Configuration'

function respuesta(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('Configuration (API + tabs)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
      const u = String(url)
      const method = (init.method ?? 'GET').toUpperCase()
      if (u.includes('/monedas/')) {
        return respuesta([
          { id: 1, codigo: 'USD', nombre: 'Dólar', simbolo: '$', decimales: 2, pais_iso: 'US', activo: true },
        ])
      }
      if (u.includes('/metodos-pago/')) {
        return respuesta([{ id: 1, codigo: 'transfer', nombre: 'Transferencia', activo: true }])
      }
      if (u.includes('/ajustes-precios/simulador/')) {
        return respuesta({ MINORISTA: 1.0, CORPORATIVO: 0.75, VIP: 0.5 })
      }
      if (u.includes('/ajustes-precios/') && method === 'PUT') return respuesta({ ok: true })
      return respuesta([])
    }))
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('muestra monedas y navega por tabs', async () => {
    const user = userEvent.setup()
    render(<Configuration />)
    expect(await screen.findByText('Monedas admitidas')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Métodos de pago' }))
    expect(screen.getByText('Métodos de pago habilitados')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Seguridad' }))
    expect(screen.getByText('Autenticación de dos factores (2FA)')).toBeInTheDocument()
  })

  it('guarda un ajuste de precio por categoría', async () => {
    const user = userEvent.setup()
    render(<Configuration />)
    await screen.findByText('Monedas admitidas')
    await user.click(screen.getByRole('button', { name: 'Ajustes por categoría' }))
    expect(screen.getByText('Ajustes de precio por categoría')).toBeInTheDocument()
    await user.clear(screen.getByLabelText('Porcentaje MINORISTA'))
    await user.type(screen.getByLabelText('Porcentaje MINORISTA'), '2')
    await user.click(screen.getAllByRole('button', { name: 'Guardar' })[0])
    expect(await screen.findByText('Ajuste de minorista actualizado a 2%.')).toBeInTheDocument()
  })
})
