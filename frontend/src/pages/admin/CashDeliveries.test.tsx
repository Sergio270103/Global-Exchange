/**
 * Pruebas PI-43: pantalla del administrador para registrar entregas de
 * billetes a las cajas, ver su estado y cancelar las pendientes.
 *
 * @module CashDeliveries.test
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CashDeliveries from '@/pages/admin/CashDeliveries'
import type { CatalogoMoneda, Entrega } from '@/services/cajas'
import * as cajas from '@/services/cajas'

vi.mock('@/services/cajas', async importOriginal => {
  const real = await importOriginal<typeof import('@/services/cajas')>()
  return {
    ...real,
    listarCajas: vi.fn(),
    listarEntregas: vi.fn(),
    listarDenominaciones: vi.fn(),
    crearEntrega: vi.fn(),
    cancelarEntrega: vi.fn(),
  }
})

const mocks = vi.mocked(cajas)

const monedas: CatalogoMoneda[] = [
  {
    moneda: 1, codigo: 'PYG', nombre: 'Guaraní', simbolo: '₲', decimales: 0, flag: '🇵🇾',
    denominaciones: [{ denominacion: 10, valor: 100000 }],
  },
  {
    moneda: 2, codigo: 'USD', nombre: 'Dólar', simbolo: '$', decimales: 2, flag: '🇺🇸',
    denominaciones: [{ denominacion: 20, valor: 100 }, { denominacion: 21, valor: 20 }],
  },
]

function entrega(over: Partial<Entrega> = {}): Entrega {
  return {
    id: 12, caja: 1, cajaNombre: 'Casa Central · Caja 1', estado: 'PENDIENTE', estadoDisplay: 'Pendiente',
    entregadoPorNombre: 'Admin Beto', observacion: 'Apertura', creadoEn: '2026-10-09T08:00:00-03:00',
    respondidoPorNombre: '', fechaRespuesta: null, motivo: '',
    totales: [{ moneda: 2, monedaCodigo: 'USD', simbolo: '$', decimales: 2, total: 1000, cantidadBilletes: 10 }],
    detalle: [{ denominacion: 20, monedaCodigo: 'USD', valor: 100, cantidad: 10, subtotal: 1000 }],
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  document.body.style.overflow = ''
  mocks.listarCajas.mockResolvedValue([
    { id: 1, nombre: 'Caja 1', sucursal: 'Casa Central', activa: true },
    { id: 2, nombre: 'Caja 2', sucursal: 'Casa Central', activa: true },
  ])
  mocks.listarDenominaciones.mockResolvedValue(monedas)
  mocks.listarEntregas.mockResolvedValue([
    entrega(),
    entrega({
      id: 11, estado: 'CONFIRMADA', estadoDisplay: 'Confirmada',
      respondidoPorNombre: 'Cajera Ana', fechaRespuesta: '2026-10-09T08:10:00-03:00',
    }),
    entrega({
      id: 10, estado: 'RECHAZADA', estadoDisplay: 'Rechazada', motivo: 'Faltan 2 billetes',
      respondidoPorNombre: 'Cajera Ana', fechaRespuesta: '2026-10-08T18:00:00-03:00',
    }),
  ])
})

describe('CashDeliveries (PI-43)', () => {
  it('lista las entregas con estado, totales y quién las recibió', async () => {
    render(<CashDeliveries />)
    expect(await screen.findByText('#12')).toBeInTheDocument()
    expect(screen.getAllByText('$ 1.000 USD')).toHaveLength(3)
    expect(screen.getByText('Pendiente')).toBeInTheDocument()
    expect(screen.getByText(/Recibida .* por Cajera Ana/)).toBeInTheDocument()
    expect(screen.getByText('Motivo: Faltan 2 billetes')).toBeInTheDocument()
    // Solo la pendiente se puede cancelar.
    expect(screen.getAllByRole('button', { name: 'Cancelar' })).toHaveLength(1)
  })

  it('filtra por estado y por caja', async () => {
    const user = userEvent.setup()
    render(<CashDeliveries />)
    await screen.findByText('#12')
    await user.click(screen.getByRole('button', { name: 'Pendientes' }))
    expect(mocks.listarEntregas).toHaveBeenLastCalledWith({ caja: undefined, estado: 'PENDIENTE' })
    await user.selectOptions(screen.getByLabelText('Filtrar por caja'), '2')
    expect(mocks.listarEntregas).toHaveBeenLastCalledWith({ caja: 2, estado: 'PENDIENTE' })
  })

  it('muestra el detalle por denominación', async () => {
    const user = userEvent.setup()
    render(<CashDeliveries />)
    await screen.findByText('#12')
    await user.click(screen.getAllByRole('button', { name: 'Ver detalle' })[0])
    expect(screen.getByText(/10 × 100 = 1\.000/)).toBeInTheDocument()
    expect(screen.getByText('Total USD (10 billetes)')).toBeInTheDocument()
  })

  it('registra una entrega en varias divisas con el total de cada una', async () => {
    mocks.crearEntrega.mockResolvedValue(entrega({ id: 13 }))
    const user = userEvent.setup()
    render(<CashDeliveries />)
    await screen.findByText('#12')
    await user.click(screen.getByRole('button', { name: '+ Nueva entrega' }))
    const dialogo = screen.getByRole('dialog', { name: 'Nueva entrega de billetes' })
    expect(within(dialogo).getByRole('button', { name: 'Registrar entrega' })).toBeDisabled()

    await user.selectOptions(within(dialogo).getByLabelText('Caja que recibe'), '2')
    await user.click(await within(dialogo).findByRole('button', { name: 'USD' }))
    await user.type(within(dialogo).getByLabelText('Billete $ 100'), '10')
    await user.type(within(dialogo).getByLabelText('Billete $ 20'), '5')
    await user.click(within(dialogo).getByRole('button', { name: 'PYG' }))
    await user.type(within(dialogo).getByLabelText('Billete ₲ 100.000'), '3')
    const totales = within(dialogo).getByTestId('totales-entrega')
    expect(totales).toHaveTextContent('Total PYG (3 billetes)₲ 300.000')
    expect(totales).toHaveTextContent('Total USD (15 billetes)$ 1.100')
    await user.type(within(dialogo).getByPlaceholderText(/Fondo de apertura/), 'Apertura')
    await user.click(within(dialogo).getByRole('button', { name: 'Registrar entrega' }))

    expect(mocks.crearEntrega).toHaveBeenCalledWith(2, [
      { denominacion: 10, cantidad: 3 },
      { denominacion: 20, cantidad: 10 },
      { denominacion: 21, cantidad: 5 },
    ], 'Apertura')
    expect(await screen.findByRole('status')).toHaveTextContent('Entrega #13 registrada')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('cancela una pendiente indicando el motivo', async () => {
    mocks.cancelarEntrega.mockResolvedValue(entrega({ estado: 'CANCELADA', estadoDisplay: 'Cancelada' }))
    const user = userEvent.setup()
    render(<CashDeliveries />)
    await screen.findByText('#12')
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    const dialogo = screen.getByRole('dialog', { name: 'Cancelar entrega #12' })
    const boton = within(dialogo).getByRole('button', { name: 'Cancelar entrega' })
    expect(boton).toBeDisabled()
    await user.type(within(dialogo).getByLabelText('Motivo'), 'Caja equivocada')
    await user.click(boton)
    expect(mocks.cancelarEntrega).toHaveBeenCalledWith(12, 'Caja equivocada')
    expect(await screen.findByRole('status')).toHaveTextContent('Entrega #12 cancelada')
  })

  it('muestra el error de la API', async () => {
    mocks.listarEntregas.mockRejectedValue(new Error('No tenés permiso para esta acción sobre entregas de billetes.'))
    render(<CashDeliveries />)
    expect(await screen.findByRole('alert')).toHaveTextContent('No tenés permiso')
  })
})
