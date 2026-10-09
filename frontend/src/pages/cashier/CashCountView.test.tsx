/**
 * Pruebas de la pantalla de caja del cajero.
 *
 * - PI-44 / PI-78: saldo por total de cada divisa, ingresos y retiros por
 *   monto, y arqueo por total de cada moneda.
 * - PI-43: el cajero confirma o rechaza las entregas pendientes.
 *
 * El servicio `@/services/cajas` se reemplaza por un mock: la API real
 * se prueba en el backend (`backend/cajas/tests.py`).
 *
 * @module CashCountView.test
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CashCountView from '@/pages/cashier/CashCountView'
import type { AuthUser } from '@/types'
import type { Arqueo, Entrega, MovimientoCaja, SaldoMoneda } from '@/services/cajas'
import * as cajas from '@/services/cajas'

vi.mock('@/services/cajas', async importOriginal => {
  const real = await importOriginal<typeof import('@/services/cajas')>()
  return {
    ...real,
    listarCajas: vi.fn(),
    obtenerSaldo: vi.fn(),
    listarMovimientos: vi.fn(),
    listarArqueos: vi.fn(),
    registrarMovimiento: vi.fn(),
    registrarArqueo: vi.fn(),
    listarEntregas: vi.fn(),
    confirmarEntrega: vi.fn(),
    rechazarEntrega: vi.fn(),
  }
})

const mocks = vi.mocked(cajas)

function saldo(usd = 400, pyg = 0): SaldoMoneda[] {
  return [
    { moneda: 1, codigo: 'PYG', nombre: 'Guaraní', simbolo: '₲', decimales: 0, flag: '🇵🇾', total: pyg },
    { moneda: 2, codigo: 'USD', nombre: 'Dólar Americano', simbolo: '$', decimales: 2, flag: '🇺🇸', total: usd },
  ]
}

const movimiento: MovimientoCaja = {
  id: 7, tipo: 'INGRESO', tipoDisplay: 'Ingreso', monedaCodigo: 'USD', total: 200, saldoResultante: 600,
  usuarioNombre: 'Cajera Ana', observacion: 'Ajuste', creadoEn: '2026-10-09T12:00:00-03:00',
}

const entregaPendiente: Entrega = {
  id: 12, caja: 1, cajaNombre: 'Casa Central · Caja 1', estado: 'PENDIENTE', estadoDisplay: 'Pendiente',
  entregadoPorNombre: 'Admin Beto', observacion: 'Fondo de apertura', creadoEn: '2026-10-09T08:00:00-03:00',
  respondidoPorNombre: '', fechaRespuesta: null, motivo: '',
  totales: [{ moneda: 2, monedaCodigo: 'USD', simbolo: '$', decimales: 2, total: 1000, cantidadBilletes: 10 }],
  detalle: [{ denominacion: 20, monedaCodigo: 'USD', valor: 100, cantidad: 10, subtotal: 1000 }],
}

const admin = { name: 'Admin', email: 'a@x.com', role: 'admin', avatar: '' } as AuthUser
const cajero = { name: 'Ana', email: 'c@x.com', role: 'cashier', avatar: '' } as AuthUser

beforeEach(() => {
  vi.clearAllMocks()
  document.body.style.overflow = ''
  mocks.listarCajas.mockResolvedValue([{ id: 1, nombre: 'Caja 1', sucursal: 'Casa Central', activa: true }])
  mocks.obtenerSaldo.mockResolvedValue(saldo())
  mocks.listarMovimientos.mockResolvedValue([])
  mocks.listarArqueos.mockResolvedValue([])
  mocks.listarEntregas.mockResolvedValue([])
})

async function abrirModal(nombre: RegExp, titulo: string, auth: AuthUser = cajero) {
  const user = userEvent.setup()
  const vista = render(<CashCountView auth={auth} />)
  await screen.findByTestId('total-USD')
  await user.click(screen.getByRole('button', { name: nombre }))
  return { user, ...vista, dialogo: screen.getByRole('dialog', { name: titulo }) }
}

const abrirMovimiento = (auth?: AuthUser) =>
  abrirModal(/Registrar movimiento/, 'Registrar movimiento de efectivo', auth)

describe('CashCountView · saldo por divisa (PI-44 / PI-78)', () => {
  it('muestra el total de cada divisa, sin detalle de billetes', async () => {
    render(<CashCountView auth={cajero} />)
    expect(await screen.findByTestId('total-USD')).toHaveTextContent('$ 400')
    expect(screen.getByTestId('total-PYG')).toHaveTextContent('₲ 0')
    expect(screen.getByText('Casa Central · Caja 1')).toBeInTheDocument()
    expect(screen.queryByText(/Billete/)).not.toBeInTheDocument()
    expect(mocks.obtenerSaldo).toHaveBeenCalledWith(1)
  })

  it('lista los movimientos con el monto y el saldo que dejaron', async () => {
    mocks.listarMovimientos.mockResolvedValue([movimiento])
    render(<CashCountView auth={cajero} />)
    expect(await screen.findByText('+$ 200 USD')).toBeInTheDocument()
    expect(screen.getByText('Saldo: $ 600')).toBeInTheDocument()
    expect(screen.getByText('Ajuste')).toBeInTheDocument()
  })

  it('registra un ingreso por monto y actualiza el saldo en pantalla', async () => {
    mocks.registrarMovimiento.mockResolvedValue({ movimiento, saldo: saldo(600) })
    const { user, dialogo } = await abrirMovimiento()
    await user.type(within(dialogo).getByLabelText('Monto (USD)'), '200')
    expect(within(dialogo).getByTestId('saldo-despues')).toHaveTextContent('$ 600')
    await user.type(within(dialogo).getByPlaceholderText(/Ajuste/), 'Ajuste')
    await user.click(within(dialogo).getByRole('button', { name: 'Confirmar movimiento' }))

    expect(mocks.registrarMovimiento).toHaveBeenCalledWith(1, {
      tipo: 'INGRESO', moneda: 2, monto: 200, observacion: 'Ajuste',
    })
    expect(await screen.findByRole('status')).toHaveTextContent('Ingreso registrado')
    expect(screen.getByTestId('total-USD')).toHaveTextContent('$ 600')
  })

  it('no deja retirar más que el saldo de la divisa', async () => {
    const { user, dialogo } = await abrirMovimiento()
    await user.selectOptions(within(dialogo).getByLabelText('Tipo'), 'RETIRO')
    await user.type(within(dialogo).getByLabelText('Monto (USD)'), '400.01')
    expect(within(dialogo).getByText('No alcanza el saldo: hay $ 400.')).toBeInTheDocument()
    expect(within(dialogo).getByTestId('saldo-despues')).toHaveTextContent('—')
    expect(within(dialogo).getByRole('button', { name: 'Confirmar movimiento' })).toBeDisabled()
    await user.clear(within(dialogo).getByLabelText('Monto (USD)'))
    await user.type(within(dialogo).getByLabelText('Monto (USD)'), '400')
    expect(within(dialogo).getByRole('button', { name: 'Confirmar movimiento' })).toBeEnabled()
    expect(mocks.registrarMovimiento).not.toHaveBeenCalled()
  })

  it('valida los decimales de la moneda', async () => {
    const { user, dialogo } = await abrirMovimiento()
    await user.selectOptions(within(dialogo).getByLabelText('Moneda'), 'PYG')
    await user.type(within(dialogo).getByLabelText('Monto (PYG)'), '1000.5')
    expect(within(dialogo).getByText('Esta moneda no admite decimales.')).toBeInTheDocument()
    expect(within(dialogo).getByRole('button', { name: 'Confirmar movimiento' })).toBeDisabled()
  })

  it('muestra el error que devuelve la API', async () => {
    mocks.registrarMovimiento.mockRejectedValue(new Error('La caja está inactiva.'))
    const { user, dialogo } = await abrirMovimiento()
    await user.type(within(dialogo).getByLabelText('Monto (USD)'), '10')
    await user.click(within(dialogo).getByRole('button', { name: 'Confirmar movimiento' }))
    expect(await within(dialogo).findByRole('alert')).toHaveTextContent('La caja está inactiva.')
  })

  it('el movimiento manual solo ofrece ingreso y retiro (las entregas van con confirmación)', async () => {
    const { dialogo, unmount } = await abrirMovimiento()
    const opciones = within(within(dialogo).getByLabelText('Tipo')).getAllByRole('option').map(o => o.textContent)
    expect(opciones).toEqual(['Ingreso', 'Retiro'])
    unmount()
    await abrirMovimiento(admin)
    expect(screen.queryByRole('option', { name: /Entrega/ })).not.toBeInTheDocument()
  })

  it('bloquea el scroll de la página mientras el modal está abierto', async () => {
    const { user, dialogo } = await abrirMovimiento()
    expect(document.body.style.overflow).toBe('hidden')
    await user.click(within(dialogo).getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(document.body.style.overflow).toBe('')
  })
})

describe('CashCountView · arqueo por total (PI-78)', () => {
  it('arranca con el total del sistema y marca faltantes y sobrantes', async () => {
    mocks.obtenerSaldo.mockResolvedValue(saldo(400, 100000))
    const arqueo: Arqueo = {
      id: 3, usuarioNombre: 'Ana', observacion: 'Cierre', conDiferencias: true,
      creadoEn: '2026-10-09T18:00:00-03:00',
      detalle: [{ moneda: 2, monedaCodigo: 'USD', simbolo: '$', decimales: 2, montoSistema: 400, montoContado: 380, diferencia: -20 }],
    }
    mocks.registrarArqueo.mockResolvedValue(arqueo)
    const { user, dialogo } = await abrirModal(/Registrar arqueo/, 'Registrar arqueo de caja')

    const usd = within(dialogo).getByLabelText('USD')
    expect(usd).toHaveValue(400)
    expect(within(dialogo).getByText('Todo coincide con el sistema.')).toBeInTheDocument()
    await user.clear(usd)
    await user.type(usd, '380')
    expect(within(dialogo).getByText('−$ 20')).toBeInTheDocument()
    expect(within(dialogo).getByText('Hay diferencias en USD.')).toBeInTheDocument()
    await user.type(within(dialogo).getByPlaceholderText(/Cierre de turno/), 'Cierre')
    await user.click(within(dialogo).getByRole('button', { name: 'Guardar arqueo' }))

    // Solo se envían las monedas con saldo o con algo contado.
    expect(mocks.registrarArqueo).toHaveBeenCalledWith(1, [
      { moneda: 1, monto: 100000 },
      { moneda: 2, monto: 380 },
    ], 'Cierre')
    expect(await screen.findByRole('status')).toHaveTextContent('CON diferencias')
    expect(screen.getByText('Con diferencias')).toBeInTheDocument()
    expect(screen.getByText('USD: faltante −$ 20')).toBeInTheDocument()
  })

  it('no deja guardar con un monto inválido', async () => {
    const { user, dialogo } = await abrirModal(/Registrar arqueo/, 'Registrar arqueo de caja')
    await user.clear(within(dialogo).getByLabelText('USD'))
    expect(within(dialogo).getByText('Revisá el monto de USD.')).toBeInTheDocument()
    expect(within(dialogo).getByRole('button', { name: 'Guardar arqueo' })).toBeDisabled()
  })
})

describe('CashCountView · entregas pendientes (PI-43)', () => {
  it('muestra las entregas pendientes de la caja', async () => {
    mocks.listarEntregas.mockResolvedValue([entregaPendiente])
    render(<CashCountView auth={cajero} />)
    const seccion = await screen.findByRole('region', { name: 'Entregas pendientes' })
    expect(within(seccion).getByText(/Tenés 1 entrega de billetes pendiente/)).toBeInTheDocument()
    expect(within(seccion).getByText(/Entrega #12 · \$ 1\.000 USD/)).toBeInTheDocument()
    expect(within(seccion).getByText(/de Admin Beto · Fondo de apertura/)).toBeInTheDocument()
    expect(mocks.listarEntregas).toHaveBeenCalledWith({ caja: 1, estado: 'PENDIENTE' })
  })

  it('el cajero ve los billetes por denominación, confirma y se suma el total', async () => {
    mocks.listarEntregas.mockResolvedValue([entregaPendiente])
    mocks.confirmarEntrega.mockResolvedValue({
      entrega: { ...entregaPendiente, estado: 'CONFIRMADA' }, saldo: saldo(1400),
    })
    const user = userEvent.setup()
    render(<CashCountView auth={cajero} />)
    await user.click(await screen.findByRole('button', { name: 'Revisar y confirmar' }))
    const dialogo = screen.getByRole('dialog', { name: 'Entrega de billetes #12' })
    expect(within(dialogo).getByText(/10 × 100 = 1\.000/)).toBeInTheDocument()
    expect(within(dialogo).getByText(/Total USD \(10 billetes\)/)).toBeInTheDocument()
    await user.click(within(dialogo).getByRole('button', { name: 'Confirmar recepción' }))

    expect(mocks.confirmarEntrega).toHaveBeenCalledWith(12)
    expect(await screen.findByRole('status')).toHaveTextContent('Entrega #12 confirmada')
    expect(screen.queryByRole('region', { name: 'Entregas pendientes' })).not.toBeInTheDocument()
    expect(screen.getByTestId('total-USD')).toHaveTextContent('$ 1.400')
  })

  it('para rechazar hay que indicar el motivo', async () => {
    mocks.listarEntregas.mockResolvedValue([entregaPendiente])
    mocks.rechazarEntrega.mockResolvedValue({ ...entregaPendiente, estado: 'RECHAZADA', motivo: 'Faltan 2 billetes' })
    const user = userEvent.setup()
    render(<CashCountView auth={cajero} />)
    await user.click(await screen.findByRole('button', { name: 'Revisar y confirmar' }))
    const dialogo = screen.getByRole('dialog', { name: 'Entrega de billetes #12' })
    await user.click(within(dialogo).getByRole('button', { name: 'No coincide, rechazar' }))
    const boton = within(dialogo).getByRole('button', { name: 'Rechazar entrega' })
    expect(boton).toBeDisabled()
    await user.type(within(dialogo).getByLabelText('Motivo del rechazo'), 'Faltan 2 billetes')
    await user.click(boton)

    expect(mocks.rechazarEntrega).toHaveBeenCalledWith(12, 'Faltan 2 billetes')
    expect(mocks.confirmarEntrega).not.toHaveBeenCalled()
    expect(await screen.findByRole('status')).toHaveTextContent('Entrega #12 rechazada')
  })

  it('muestra el error si la confirmación falla', async () => {
    mocks.listarEntregas.mockResolvedValue([entregaPendiente])
    mocks.confirmarEntrega.mockRejectedValue(new Error('La entrega ya está confirmada.'))
    const user = userEvent.setup()
    render(<CashCountView auth={cajero} />)
    await user.click(await screen.findByRole('button', { name: 'Revisar y confirmar' }))
    const dialogo = screen.getByRole('dialog', { name: 'Entrega de billetes #12' })
    await user.click(within(dialogo).getByRole('button', { name: 'Confirmar recepción' }))
    expect(await within(dialogo).findByRole('alert')).toHaveTextContent('La entrega ya está confirmada.')
  })
})

describe('CashCountView · estados generales', () => {
  it('avisa cuando no hay cajas habilitadas', async () => {
    mocks.listarCajas.mockResolvedValue([])
    render(<CashCountView auth={cajero} />)
    expect(await screen.findByText(/No hay cajas habilitadas/)).toBeInTheDocument()
  })

  it('muestra el error si no se puede cargar el saldo', async () => {
    mocks.obtenerSaldo.mockRejectedValue(new Error('Solo el cajero o un administrador pueden acceder a las cajas.'))
    render(<CashCountView auth={cajero} />)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Solo el cajero'))
  })
})
