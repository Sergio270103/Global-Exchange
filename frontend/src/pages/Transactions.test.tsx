/**
 * Pruebas del historial de transacciones (PI-65, RF34/RF35).
 *
 * Reemplaza las pruebas del respaldo local con datos de prueba: el historial
 * ahora muestra solo datos reales y, si la API falla, informa el error.
 *
 * @module Transactions.test
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@/services/historial', async importOriginal => {
  const real = await importOriginal<typeof import('@/services/historial')>()
  return { ...real, listarHistorial: vi.fn(), descargarHistorial: vi.fn() }
})
vi.mock('@/services/cotizaciones', () => ({ vigentes: vi.fn().mockResolvedValue([]) }))

import { descargarHistorial, listarHistorial } from '@/services/historial'
import type { Operacion } from '@/services/operaciones'
import Transactions from '@/pages/Transactions'

const listarMock = vi.mocked(listarHistorial)
const descargarMock = vi.mocked(descargarHistorial)

const usuario = { name: 'Enrique Acosta', email: 'e@test.com', role: 'user' as const, avatar: '' }
const admin = { name: 'Beatriz Sosa', email: 'b@test.com', role: 'admin' as const, avatar: '' }
const cliente = { id: 1, nombre: 'Carlos' }

function op(id: number, extra: Partial<Operacion> = {}): Operacion {
  return {
    id, cliente: 1, cliente_nombre: 'Carlos', usuario_keycloak_id: 's', usuario_nombre: 'Enrique Acosta',
    tipo_operacion: 'COMPRA', moneda_origen: 1, moneda_origen_codigo: 'PYG',
    moneda_destino: 2, moneda_destino_codigo: 'USD', monto_enviado: 765700, monto_recibido: 100,
    cotizacion_aplicada: 7657, tasa_origen: null, tasa_destino: 7657, metodo_pago: '',
    billetera_destino: null, billetera_destino_detalle: '', cuenta_origen: null, cuenta_origen_detalle: '',
    billetera_origen: null, billetera_origen_detalle: '',
    fecha_creacion: '2026-09-28T15:31:00Z', estado: 'PAGADA', fecha_cotizacion: '2026-09-28T15:31:00Z',
    fecha_confirmacion: '2026-09-28T15:32:00Z', fecha_cancelacion: null, cancelada_por: '',
    cancelada_por_nombre: '', motivo_cancelacion: '', tolerancia_segundos: 30, segundos_restantes: 0,
    ...extra,
  }
}

const cancelada = () => op(2, {
  estado: 'CANCELADA', fecha_confirmacion: null, fecha_cancelacion: '2026-09-28T15:34:00Z',
  cancelada_por_nombre: 'Enrique Acosta', motivo_cancelacion: 'COTIZACION_CAMBIADA',
})

beforeEach(() => {
  listarMock.mockReset()
  descargarMock.mockReset()
})

afterEach(() => {
  cleanup()
})

describe('Transactions: usuario', () => {
  it('muestra el historial real del cliente activo', async () => {
    listarMock.mockResolvedValue([op(1)])
    render(<Transactions auth={usuario} currentClient={cliente} />)
    expect(await screen.findByText('#1')).toBeInTheDocument()
    expect(screen.getByText('Carlos', { selector: 'span.font-semibold' })).toBeInTheDocument()
    expect(listarMock).toHaveBeenCalledWith(expect.objectContaining({ clienteId: 1, todos: undefined }))
  })

  it('si la API falla muestra el error y no datos inventados', async () => {
    listarMock.mockRejectedValue(new Error('API apagada'))
    render(<Transactions auth={usuario} currentClient={cliente} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('API apagada')
    expect(screen.queryByText(/TRX-/)).not.toBeInTheDocument()
  })

  it('Pagada y Cancelada muestran por quién; Pendiente no', async () => {
    listarMock.mockResolvedValue([op(1), cancelada(), op(3, { estado: 'PENDIENTE', usuario_nombre: 'Otra Persona' })])
    render(<Transactions auth={usuario} currentClient={cliente} />)
    await screen.findByText('#1')
    expect(screen.getAllByText('por Enrique Acosta')).toHaveLength(2)
    expect(screen.queryByText('por Otra Persona')).not.toBeInTheDocument()
    // El cliente no ve el motivo (es de auditoría).
    expect(screen.queryByText(/No aceptó la nueva cotización/)).not.toBeInTheDocument()
  })

  it('filtra por estado en el backend (RF35)', async () => {
    listarMock.mockResolvedValue([op(1)])
    const user = userEvent.setup()
    render(<Transactions auth={usuario} currentClient={cliente} />)
    await screen.findByText('#1')
    await user.selectOptions(screen.getByLabelText('Estado'), 'CANCELADA')
    expect(listarMock).toHaveBeenLastCalledWith(expect.objectContaining({ estado: 'CANCELADA' }))
  })

  it('el filtro de estado ofrece los cuatro estados', async () => {
    listarMock.mockResolvedValue([])
    render(<Transactions auth={usuario} currentClient={cliente} />)
    await screen.findByText('Todavía no tenés operaciones')
    const opciones = Array.from((screen.getByLabelText('Estado') as HTMLSelectElement).options).map(o => o.value)
    expect(opciones).toEqual(['', 'PENDIENTE', 'PAGADA', 'CANCELADA', 'ANULADA'])
  })

  it('avisa si el rango de fechas es inválido', async () => {
    listarMock.mockResolvedValue([])
    const user = userEvent.setup()
    render(<Transactions auth={usuario} currentClient={cliente} />)
    await screen.findByText('Todavía no tenés operaciones')
    await user.type(screen.getByLabelText('Desde'), '2026-09-30')
    await user.type(screen.getByLabelText('Hasta'), '2026-09-01')
    expect(await screen.findByRole('alert')).toHaveTextContent(/posterior/)
  })

  it('descarga lo que se ve en la tabla (RF34)', async () => {
    listarMock.mockResolvedValue([op(1)])
    const user = userEvent.setup()
    render(<Transactions auth={usuario} currentClient={cliente} />)
    await screen.findByText('#1')
    await user.click(screen.getByRole('button', { name: /Descargar historial/ }))
    expect(descargarMock).toHaveBeenCalledWith([expect.objectContaining({ id: 1 })], expect.anything())
  })

  it('sin operaciones el botón de descarga está deshabilitado', async () => {
    listarMock.mockResolvedValue([])
    render(<Transactions auth={usuario} currentClient={cliente} />)
    await screen.findByText('Todavía no tenés operaciones')
    expect(screen.getByRole('button', { name: /Descargar historial/ })).toBeDisabled()
  })
})

describe('Transactions: administrador (auditoría)', () => {
  it('pide todas las operaciones y lo indica', async () => {
    listarMock.mockResolvedValue([op(1)])
    render(<Transactions auth={admin} currentClient={null} />)
    expect(await screen.findByText('Auditoría')).toBeInTheDocument()
    expect(listarMock).toHaveBeenCalledWith(expect.objectContaining({ todos: true, clienteId: undefined }))
  })

  it('en las canceladas ve quién y el motivo', async () => {
    listarMock.mockResolvedValue([cancelada()])
    render(<Transactions auth={admin} currentClient={null} />)
    expect(await screen.findByText('por Enrique Acosta · No aceptó la nueva cotización')).toBeInTheDocument()
  })
})