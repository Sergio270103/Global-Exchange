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
import type { CatalogoMoneda, Entrega, SolicitudReposicion } from '@/services/cajas'
import * as cajas from '@/services/cajas'
import * as monedasServicio from '@/services/monedas'

vi.mock('@/services/cajas', async importOriginal => {
  const real = await importOriginal<typeof import('@/services/cajas')>()
  return {
    ...real,
    listarCajas: vi.fn(),
    listarEntregas: vi.fn(),
    listarDenominaciones: vi.fn(),
    listarSolicitudes: vi.fn(),
    rechazarSolicitud: vi.fn(),
    crearEntrega: vi.fn(),
    cancelarEntrega: vi.fn(),
  }
})

const mocks = vi.mocked(cajas)

vi.mock('@/services/monedas', async importOriginal => {
  const real = await importOriginal<typeof import('@/services/monedas')>()
  return { ...real, listarMonedas: vi.fn() }
})

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

/** Pedido de reposición del cajero (PI-80). */
function solicitud(over: Partial<SolicitudReposicion> = {}): SolicitudReposicion {
  return {
    id: 7, caja: 1, cajaNombre: 'Casa Central · Caja 1', moneda: 2,
    monedaCodigo: 'USD', monedaNombre: 'Dólar', simbolo: '$', decimales: 2,
    monto: 400, estado: 'PENDIENTE', estadoDisplay: 'Pendiente',
    cajeroNombre: 'Cajera Ana', observacion: 'Se me acabaron los billetes grandes',
    creadoEn: '2026-10-12T09:00:00-03:00',
    respondidoPorNombre: '', fechaRespuesta: null, motivo: '', entregaId: null,
    detalle: [
      { denominacion: 20, monedaCodigo: 'USD', valor: 100, cantidad: 3, subtotal: 300 },
      { denominacion: 21, monedaCodigo: 'USD', valor: 20, cantidad: 5, subtotal: 100 },
    ],
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  document.body.style.overflow = ''
  mocks.listarCajas.mockResolvedValue([
    {
      id: 1, nombre: 'Caja 1', sucursal: 'Casa Central', activa: true, abierta: true,
      turnoActual: { id: 5, cajeroNombre: 'Cajera Ana', abiertoEn: '2026-10-09T08:10:00-03:00', entregaApertura: 11 },
    },
    { id: 2, nombre: 'Caja 2', sucursal: 'Casa Central', activa: true, abierta: false, turnoActual: null },
  ])
  mocks.listarDenominaciones.mockResolvedValue(monedas)
  mocks.listarSolicitudes.mockResolvedValue([])
  vi.mocked(monedasServicio.listarMonedas).mockResolvedValue([
    { id: 1, code: 'PYG', name: 'Guaraní', symbol: '₲', flag: '🇵🇾', decimals: 0, active: true },
    { id: 2, code: 'USD', name: 'Dólar', symbol: '$', flag: '🇺🇸', decimals: 2, active: true },
  ])
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

  it('avisa que hay una moneda activa sin billetes registrados', async () => {
    // El selector de divisa arma la lista desde `listarDenominaciones`, así
    // que una moneda activa sin billetes desaparece en silencio. DKK es el
    // caso real: se dio de alta pero nunca se le cargaron billetes.
    vi.mocked(monedasServicio.listarMonedas).mockResolvedValue([
      { id: 1, code: 'PYG', name: 'Guaraní', symbol: '₲', flag: '🇵🇾', decimals: 0, active: true },
      { id: 2, code: 'USD', name: 'Dólar', symbol: '$', flag: '🇺🇸', decimals: 2, active: true },
      { id: 3, code: 'DKK', name: 'Corona Danesa', symbol: 'kr', flag: '🇩🇰', decimals: 2, active: true },
    ])
    const user = userEvent.setup()
    render(<CashDeliveries />)
    await screen.findByText('#12')
    await user.click(screen.getByRole('button', { name: '+ Nueva entrega' }))
    const dialogo = screen.getByRole('dialog', { name: 'Nueva entrega de billetes' })
    // No se la ofrece para elegir, pero sí se explica por qué falta.
    expect(within(dialogo).queryByRole('button', { name: 'DKK' })).not.toBeInTheDocument()
    const aviso = within(dialogo).getByText(/no tiene billetes registrados/)
    expect(aviso).toHaveTextContent('DKK')
    expect(aviso).toHaveTextContent(/Configuración → Monedas → Billetes/)
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
    ], 'Apertura', null)
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

  it('PI-79: muestra si cada caja está abierta o cerrada', async () => {
    render(<CashDeliveries />)
    const estado = await screen.findByLabelText('Estado de las cajas')
    expect(within(estado).getByText(/Caja 1: abierta por Cajera Ana desde/)).toBeInTheDocument()
    expect(within(estado).getByText(/Caja 2: cerrada/)).toBeInTheDocument()
  })

  it('PI-79: avisa si la entrega abre la caja o es una reposición', async () => {
    const user = userEvent.setup()
    render(<CashDeliveries />)
    await screen.findByText('#12')
    await user.click(screen.getByRole('button', { name: '+ Nueva entrega' }))
    const dialogo = screen.getByRole('dialog', { name: 'Nueva entrega de billetes' })
    expect(within(dialogo).getByText(/abierta por Cajera Ana: esta entrega es una reposición/)).toBeInTheDocument()
    await user.selectOptions(within(dialogo).getByLabelText('Caja que recibe'), '2')
    expect(within(dialogo).getByText(/cerrada: esta entrega será la apertura/)).toBeInTheDocument()
  })

  it('muestra el error de la API', async () => {
    mocks.listarEntregas.mockRejectedValue(new Error('No tenés permiso para esta acción sobre entregas de billetes.'))
    render(<CashDeliveries />)
    expect(await screen.findByRole('alert')).toHaveTextContent('No tenés permiso')
  })
})

describe('CashDeliveries · solicitudes de reposición (PI-80)', () => {
  it('lista los pedidos del cajero con el detalle que pidió', async () => {
    mocks.listarSolicitudes.mockResolvedValue([solicitud()])
    render(<CashDeliveries />)
    const seccion = await screen.findByLabelText('Solicitudes de reposición')
    expect(seccion).toHaveTextContent('1 pendiente(s)')
    expect(seccion).toHaveTextContent('Pide $ 400 de USD')
    expect(seccion).toHaveTextContent('por Cajera Ana')
    expect(seccion).toHaveTextContent('Pide billetes: 3 × $ 100 + 5 × $ 20')
  })

  it('no ofrece atender ni rechazar un pedido ya respondido', async () => {
    mocks.listarSolicitudes.mockResolvedValue([
      solicitud({ estado: 'ATENDIDA', estadoDisplay: 'Atendida', entregaId: 12 }),
      solicitud({
        id: 6, estado: 'RECHAZADA', estadoDisplay: 'Rechazada',
        motivo: 'Tesorería sin efectivo', fechaRespuesta: '2026-10-12T11:00:00-03:00',
      }),
    ])
    render(<CashDeliveries />)
    const seccion = await screen.findByLabelText('Solicitudes de reposición')
    expect(seccion).toHaveTextContent('Atendida')
    expect(seccion).toHaveTextContent('Tesorería sin efectivo')
    expect(screen.queryByRole('button', { name: 'Registrar entrega' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Rechazar' })).not.toBeInTheDocument()
  })

  it('atiende el pedido registrando una entrega con lo que pidió cargado', async () => {
    const user = userEvent.setup()
    mocks.listarSolicitudes.mockResolvedValue([solicitud()])
    mocks.crearEntrega.mockResolvedValue(entrega({ id: 13 }))
    render(<CashDeliveries />)
    await screen.findByLabelText('Solicitudes de reposición')
    await user.click(screen.getByRole('button', { name: 'Registrar entrega' }))

    const dialogo = screen.getByRole('dialog', { name: 'Nueva entrega de billetes' })
    // Los billetes que pidió el cajero ya vienen cargados.
    expect(within(dialogo).getByLabelText('Billete $ 100')).toHaveValue(3)
    expect(within(dialogo).getByLabelText('Billete $ 20')).toHaveValue(5)
    await user.click(within(dialogo).getByRole('button', { name: 'Registrar entrega' }))

    // Y la entrega va enlazada al pedido, que queda atendido.
    expect(mocks.crearEntrega).toHaveBeenCalledWith(
      1,
      [{ denominacion: 20, cantidad: 3 }, { denominacion: 21, cantidad: 5 }],
      '',
      7,
    )
    expect(await screen.findByRole('status')).toHaveTextContent('Entrega #13 registrada')
  })

  it('el administrador puede cambiar los billetes precargados', async () => {
    const user = userEvent.setup()
    mocks.listarSolicitudes.mockResolvedValue([solicitud()])
    mocks.crearEntrega.mockResolvedValue(entrega({ id: 13 }))
    render(<CashDeliveries />)
    await screen.findByLabelText('Solicitudes de reposición')
    await user.click(screen.getByRole('button', { name: 'Registrar entrega' }))
    const dialogo = screen.getByRole('dialog', { name: 'Nueva entrega de billetes' })

    await user.clear(within(dialogo).getByLabelText('Billete $ 100'))
    await user.type(within(dialogo).getByLabelText('Billete $ 100'), '2')
    await user.click(within(dialogo).getByRole('button', { name: 'Registrar entrega' }))

    expect(mocks.crearEntrega).toHaveBeenCalledWith(
      1,
      [{ denominacion: 20, cantidad: 2 }, { denominacion: 21, cantidad: 5 }],
      '',
      7,
    )
  })

  it('rechaza el pedido indicando el motivo', async () => {
    const user = userEvent.setup()
    mocks.listarSolicitudes.mockResolvedValue([solicitud()])
    mocks.rechazarSolicitud.mockResolvedValue(
      solicitud({ estado: 'RECHAZADA', estadoDisplay: 'Rechazada', motivo: 'Sin efectivo' }),
    )
    render(<CashDeliveries />)
    await screen.findByLabelText('Solicitudes de reposición')
    await user.click(screen.getByRole('button', { name: 'Rechazar' }))

    const dialogo = screen.getByRole('dialog', { name: 'Rechazar solicitud #7' })
    const boton = within(dialogo).getByRole('button', { name: 'Rechazar solicitud' })
    expect(boton).toBeDisabled()
    await user.type(within(dialogo).getByLabelText('Motivo'), 'Tesorería sin efectivo')
    await user.click(boton)

    expect(mocks.rechazarSolicitud).toHaveBeenCalledWith(7, 'Tesorería sin efectivo')
    expect(await screen.findByRole('status')).toHaveTextContent('Solicitud #7 rechazada')
  })

  it('no deja rechazar sin motivo', async () => {
    const user = userEvent.setup()
    mocks.listarSolicitudes.mockResolvedValue([solicitud()])
    render(<CashDeliveries />)
    await screen.findByLabelText('Solicitudes de reposición')
    await user.click(screen.getByRole('button', { name: 'Rechazar' }))
    const dialogo = screen.getByRole('dialog', { name: 'Rechazar solicitud #7' })

    await user.type(within(dialogo).getByLabelText('Motivo'), '   ')
    expect(within(dialogo).getByRole('button', { name: 'Rechazar solicitud' })).toBeDisabled()
    expect(mocks.rechazarSolicitud).not.toHaveBeenCalled()
  })

  it('las entregas se siguen viendo aunque falle la lista de pedidos', async () => {
    mocks.listarSolicitudes.mockRejectedValue(new Error('sin permisos'))
    render(<CashDeliveries />)
    expect(await screen.findByText('#12')).toBeInTheDocument()
  })
})
