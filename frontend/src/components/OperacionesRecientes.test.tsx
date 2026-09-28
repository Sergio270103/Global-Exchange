/**
 * Pruebas de las operaciones recientes del Dashboard (PI-65).
 *
 * @module components/OperacionesRecientes.test
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@/services/historial', async importOriginal => {
  const real = await importOriginal<typeof import('@/services/historial')>()
  return { ...real, listarHistorial: vi.fn() }
})

import { listarHistorial } from '@/services/historial'
import type { Operacion } from '@/services/operaciones'
import OperacionesRecientes, { CANTIDAD_RECIENTES } from '@/components/OperacionesRecientes'

const listarMock = vi.mocked(listarHistorial)
const usuario = { name: 'Enrique Acosta', email: 'e@test.com', role: 'user' as const, avatar: '' }
const admin = { name: 'Beatriz Sosa', email: 'b@test.com', role: 'admin' as const, avatar: '' }
const cliente = { id: 3, nombre: 'Corporación Atlas S.A.' }

function op(id: number, extra: Partial<Operacion> = {}): Operacion {
  return {
    id, cliente: 3, cliente_nombre: 'Corporación Atlas S.A.', usuario_keycloak_id: 's', usuario_nombre: 'enrique',
    tipo_operacion: 'COMPRA', moneda_origen: 1, moneda_origen_codigo: 'PYG',
    moneda_destino: 2, moneda_destino_codigo: 'USD', monto_enviado: 765700, monto_recibido: 100,
    cotizacion_aplicada: 7657, tasa_origen: null, tasa_destino: 7657, metodo_pago: '',
    billetera_destino: null, billetera_destino_detalle: '', cuenta_origen: null, cuenta_origen_detalle: '',
    billetera_origen: null, billetera_origen_detalle: '',
    fecha_creacion: '2026-09-28T15:31:00Z', estado: 'PAGADA', fecha_cotizacion: '2026-09-28T15:31:00Z',
    fecha_confirmacion: null, fecha_cancelacion: null, cancelada_por: '', cancelada_por_nombre: '',
    motivo_cancelacion: '', tolerancia_segundos: 30, segundos_restantes: 0,
    ...extra,
  }
}

beforeEach(() => {
  listarMock.mockReset()
})

afterEach(() => {
  cleanup()
})

describe('OperacionesRecientes', () => {
  it('el usuario ve las del cliente activo', async () => {
    listarMock.mockResolvedValue([])
    render(<OperacionesRecientes auth={usuario} currentClient={cliente} navigate={vi.fn()} />)
    await screen.findByText('Todavía no hay operaciones.')
    expect(listarMock).toHaveBeenCalledWith({ todos: undefined, clienteId: 3 })
  })

  it('el admin ve las de todos los clientes', async () => {
    listarMock.mockResolvedValue([op(1)])
    render(<OperacionesRecientes auth={admin} currentClient={null} navigate={vi.fn()} />)
    expect(await screen.findByText(/Corporación Atlas S\.A\./)).toBeInTheDocument()
    expect(listarMock).toHaveBeenCalledWith({ todos: true, clienteId: undefined })
  })

  it('muestra datos reales: tipo, divisa, monto y estado', async () => {
    listarMock.mockResolvedValue([
      op(8, { tipo_operacion: 'VENTA', moneda_origen_codigo: 'USD', moneda_destino_codigo: 'PYG', monto_enviado: 500, estado: 'CANCELADA' }),
      op(7),
    ])
    render(<OperacionesRecientes auth={usuario} currentClient={cliente} navigate={vi.fn()} />)
    expect(await screen.findByText('Venta USD')).toBeInTheDocument()
    expect(screen.getByText('Compra USD')).toBeInTheDocument()
    expect(screen.getByText('500,00 USD')).toBeInTheDocument()
    expect(screen.getByText('Cancelada')).toBeInTheDocument()
    expect(screen.getByText('Pagada')).toBeInTheDocument()
  })

  it(`muestra como máximo ${CANTIDAD_RECIENTES}`, async () => {
    listarMock.mockResolvedValue(Array.from({ length: 9 }, (_, i) => op(i + 1)))
    render(<OperacionesRecientes auth={usuario} currentClient={cliente} navigate={vi.fn()} />)
    expect(await screen.findAllByText('Compra USD')).toHaveLength(CANTIDAD_RECIENTES)
  })

  it('"Ver todo" lleva al historial', async () => {
    listarMock.mockResolvedValue([op(1)])
    const navigate = vi.fn()
    render(<OperacionesRecientes auth={admin} currentClient={null} navigate={navigate} />)
    await screen.findByText('Compra USD')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Ver todo →' }))
    expect(navigate).toHaveBeenCalledWith('transactions')
  })

  it('si falla la carga muestra un aviso', async () => {
    listarMock.mockRejectedValue(new Error('500'))
    render(<OperacionesRecientes auth={usuario} currentClient={cliente} navigate={vi.fn()} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudieron cargar las operaciones.')
  })
})