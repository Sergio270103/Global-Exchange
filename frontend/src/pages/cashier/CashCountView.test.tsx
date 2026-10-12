/**
 * Pruebas de la pantalla de caja del cajero.
 *
 * - PI-44 / PI-78: saldo por total de cada divisa, ingresos y retiros por
 *   monto, y arqueo por total de cada moneda.
 * - PI-43: el cajero confirma o rechaza las entregas pendientes.
 * - PI-79: la caja se abre con la entrega inicial, solo se opera abierta y
 *   se cierra con el recuento final (el efectivo vuelve a tesorería).
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
import type {
  Arqueo, AvisoReposicion, Entrega, MovimientoCaja, SaldoMoneda,
  SolicitudReposicion, Turno,
} from '@/services/cajas'
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
    obtenerTurno: vi.fn(),
    cerrarCaja: vi.fn(),
    obtenerAvisosReposicion: vi.fn(),
    listarSolicitudes: vi.fn(),
    crearSolicitud: vi.fn(),
    listarDenominaciones: vi.fn(),
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

const turnoAbierto: Turno = {
  id: 5, abierto: true, cajeroNombre: 'Cajera Ana', abiertoEn: '2026-10-09T08:10:00-03:00',
  entregaApertura: 11, cerradoEn: null, cerradoPorNombre: '', arqueoCierre: null,
}

const admin = { name: 'Admin', email: 'a@x.com', role: 'admin', avatar: '' } as AuthUser
const cajero = { name: 'Ana', email: 'c@x.com', role: 'cashier', avatar: '' } as AuthUser

/** Divisa que quedó por debajo del mínimo de la caja (PI-80). */
function aviso(over: Partial<AvisoReposicion> = {}): AvisoReposicion {
  return {
    moneda: 2, codigo: 'USD', nombre: 'Dólar Americano', simbolo: '$', decimales: 2,
    total: 300, saldoMinimo: 500, faltante: 200, ...over,
  }
}

function solicitud(over: Partial<SolicitudReposicion> = {}): SolicitudReposicion {
  return {
    id: 7, caja: 1, cajaNombre: 'Casa Central · Caja 1', moneda: 2,
    monedaCodigo: 'USD', monedaNombre: 'Dólar Americano', simbolo: '$', decimales: 2,
    monto: 200, estado: 'PENDIENTE', estadoDisplay: 'Pendiente',
    cajeroNombre: 'Cajera Ana', observacion: '', creadoEn: '2026-10-12T09:00:00-03:00',
    respondidoPorNombre: '', fechaRespuesta: null, motivo: '', entregaId: null, detalle: [],
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  document.body.style.overflow = ''
  mocks.listarCajas.mockResolvedValue([
    { id: 1, nombre: 'Caja 1', sucursal: 'Casa Central', activa: true, abierta: true, turnoActual: null },
  ])
  mocks.obtenerSaldo.mockResolvedValue(saldo())
  mocks.listarMovimientos.mockResolvedValue([])
  mocks.listarArqueos.mockResolvedValue([])
  mocks.listarEntregas.mockResolvedValue([])
  mocks.obtenerTurno.mockResolvedValue(turnoAbierto)
  mocks.obtenerAvisosReposicion.mockResolvedValue([])
  mocks.listarSolicitudes.mockResolvedValue([])
  mocks.listarDenominaciones.mockResolvedValue([
    {
      moneda: 1, codigo: 'PYG', nombre: 'Guaraní', simbolo: '₲', decimales: 0, flag: '🇵🇾',
      denominaciones: [{ denominacion: 10, valor: 100000 }],
    },
    {
      moneda: 2, codigo: 'USD', nombre: 'Dólar Americano', simbolo: '$', decimales: 2, flag: '🇺🇸',
      denominaciones: [{ denominacion: 20, valor: 100 }, { denominacion: 21, valor: 20 }],
    },
  ])
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
      id: 3, usuarioNombre: 'Ana', observacion: 'Cierre', conDiferencias: true, esCierre: false,
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
    await user.type(within(dialogo).getByPlaceholderText(/Arqueo de media mañana/), 'Cierre')
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
      entrega: { ...entregaPendiente, estado: 'CONFIRMADA' }, saldo: saldo(1400), turno: turnoAbierto,
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

describe('CashCountView · apertura y cierre (PI-79)', () => {
  it('con la caja abierta muestra quién la tiene y desde cuándo', async () => {
    render(<CashCountView auth={cajero} />)
    expect(await screen.findByTestId('estado-caja')).toHaveTextContent(/Caja abierta desde las .* · Cajera Ana/)
    expect(screen.getByRole('button', { name: /Cerrar caja/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Registrar movimiento/ })).toBeEnabled()
  })

  it('con la caja cerrada no deja operar y explica cómo se abre', async () => {
    mocks.obtenerTurno.mockResolvedValue(null)
    render(<CashCountView auth={cajero} />)
    expect(await screen.findByTestId('estado-caja')).toHaveTextContent('Caja cerrada')
    expect(screen.getByRole('note')).toHaveTextContent('Se abre al confirmar la entrega de billetes del administrador')
    expect(screen.getByRole('button', { name: /Registrar movimiento/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Registrar arqueo/ })).toBeDisabled()
    expect(screen.queryByRole('button', { name: /Cerrar caja/ })).not.toBeInTheDocument()
  })

  it('confirmar la entrega inicial abre la caja', async () => {
    mocks.obtenerTurno.mockResolvedValue(null)
    mocks.obtenerSaldo.mockResolvedValue(saldo(0))
    mocks.listarEntregas.mockResolvedValue([entregaPendiente])
    mocks.confirmarEntrega.mockResolvedValue({
      entrega: { ...entregaPendiente, estado: 'CONFIRMADA' }, saldo: saldo(1000), turno: turnoAbierto,
    })
    const user = userEvent.setup()
    render(<CashCountView auth={cajero} />)
    await user.click(await screen.findByRole('button', { name: 'Revisar y confirmar' }))
    await user.click(screen.getByRole('button', { name: 'Confirmar recepción' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Caja abierta con la entrega #12')
    expect(screen.getByTestId('estado-caja')).toHaveTextContent('Caja abierta')
    expect(screen.getByRole('button', { name: /Registrar movimiento/ })).toBeEnabled()
    expect(screen.getByTestId('total-USD')).toHaveTextContent('$ 1.000')
  })

  it('cierra la caja con el recuento final y el saldo queda en 0', async () => {
    mocks.obtenerSaldo.mockResolvedValue(saldo(400, 100000))
    const recuento: Arqueo = {
      id: 9, usuarioNombre: 'Cajera Ana', observacion: 'Cierre del día', conDiferencias: true, esCierre: true,
      creadoEn: '2026-10-09T19:00:00-03:00',
      detalle: [{ moneda: 2, monedaCodigo: 'USD', simbolo: '$', decimales: 2, montoSistema: 400, montoContado: 390, diferencia: -10 }],
    }
    mocks.cerrarCaja.mockResolvedValue({
      turno: { ...turnoAbierto, abierto: false, cerradoEn: '2026-10-09T19:00:00-03:00', cerradoPorNombre: 'Cajera Ana', arqueoCierre: recuento },
      saldo: saldo(0, 0),
    })
    const { user, dialogo } = await abrirModal(/Cerrar caja/, 'Cerrar caja')
    expect(within(dialogo).getByText(/el efectivo se devuelve a tesorería/)).toBeInTheDocument()
    await user.clear(within(dialogo).getByLabelText('USD'))
    await user.type(within(dialogo).getByLabelText('USD'), '390')
    await user.type(within(dialogo).getByPlaceholderText(/Cierre del día/), 'Cierre del día')
    await user.click(within(dialogo).getByRole('button', { name: 'Cerrar caja' }))

    expect(mocks.cerrarCaja).toHaveBeenCalledWith(1, [
      { moneda: 1, monto: 100000 },
      { moneda: 2, monto: 390 },
    ], 'Cierre del día')
    expect(mocks.registrarArqueo).not.toHaveBeenCalled()
    expect(await screen.findByRole('status')).toHaveTextContent('Caja cerrada CON diferencias')
    expect(screen.getByTestId('estado-caja')).toHaveTextContent('Caja cerrada')
    expect(screen.getByTestId('total-USD')).toHaveTextContent('$ 0')
    expect(screen.getByText('Cierre')).toBeInTheDocument()
    expect(screen.getByText('USD: faltante −$ 10')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Registrar movimiento/ })).toBeDisabled()
  })

  it('el arqueo intermedio no cierra la caja', async () => {
    mocks.registrarArqueo.mockResolvedValue({
      id: 4, usuarioNombre: 'Ana', observacion: '', conDiferencias: false, esCierre: false,
      creadoEn: '2026-10-09T12:00:00-03:00', detalle: [],
    })
    const { user, dialogo } = await abrirModal(/Registrar arqueo/, 'Registrar arqueo de caja')
    await user.click(within(dialogo).getByRole('button', { name: 'Guardar arqueo' }))
    expect(mocks.registrarArqueo).toHaveBeenCalled()
    expect(mocks.cerrarCaja).not.toHaveBeenCalled()
    expect(await screen.findByRole('status')).toHaveTextContent('Arqueo registrado sin diferencias')
    expect(screen.getByTestId('estado-caja')).toHaveTextContent('Caja abierta')
  })
})

describe('CashCountView · reposición de billetes (PI-80)', () => {
  it('la sección de reposición está siempre, aunque nada esté bajo el mínimo', async () => {
    render(<CashCountView auth={cajero} />)
    // El botón general existe siempre: se puede pedir por falta de
    // billetes aunque el saldo total todavía alcance. (La sección espera a
    // que se conozca la caja, así que va con find.)
    expect(
      await screen.findByRole('button', { name: '+ Solicitar reposición' }),
    ).toBeInTheDocument()
    // Y una vez que cargó, avisa que no hay nada urgente.
    expect(await screen.findByText(/Ninguna divisa está por debajo del mínimo/)).toBeInTheDocument()
  })

  it('permite pedir sin aviso de saldo bajo, eligiendo la divisa', async () => {
    const user = userEvent.setup()
    mocks.crearSolicitud.mockResolvedValue(solicitud({ monto: 5000 }))
    render(<CashCountView auth={cajero} />)
    await screen.findByLabelText('Reposición de billetes')
    await user.click(screen.getByRole('button', { name: '+ Solicitar reposición' }))

    const dialogo = screen.getByRole('dialog', { name: 'Solicitar reposición de billetes' })
    // Sin aviso previo, el cajero elige la divisa y el monto arranca vacío.
    expect(within(dialogo).getByLabelText('Divisa que necesitás')).toBeInTheDocument()
    const monto = within(dialogo).getByLabelText('Monto que necesitás (PYG)')
    expect(monto).toHaveValue(null)

    await user.selectOptions(within(dialogo).getByLabelText('Divisa que necesitás'), '2')
    const usd = await within(dialogo).findByLabelText('Monto que necesitás (USD)')
    await user.type(usd, '5000')
    await user.click(within(dialogo).getByRole('button', { name: 'Enviar solicitud' }))

    expect(mocks.crearSolicitud).toHaveBeenCalledWith(
      expect.objectContaining({ caja: 1, moneda: 2, monto: '5000' }),
    )
  })

  it('limpia los billetes al cambiar de divisa en el pedido', async () => {
    const user = userEvent.setup()
    render(<CashCountView auth={cajero} />)
    await screen.findByLabelText('Reposición de billetes')
    await user.click(screen.getByRole('button', { name: '+ Solicitar reposición' }))
    const dialogo = screen.getByRole('dialog', { name: 'Solicitar reposición de billetes' })

    await user.type(within(dialogo).getByLabelText('Billete ₲ 100.000'), '2')
    await user.selectOptions(within(dialogo).getByLabelText('Divisa que necesitás'), '2')
    // Los billetes de la divisa anterior no arrastran.
    await screen.findByLabelText('Billete $ 100')
    expect(within(dialogo).getByLabelText('Billete $ 100')).toHaveValue(null)
    expect(within(dialogo).queryByLabelText('Billete ₲ 100.000')).not.toBeInTheDocument()
  })

  it('avisa que no se puede pedir si ninguna moneda tiene billetes', async () => {
    const user = userEvent.setup()
    mocks.listarDenominaciones.mockResolvedValue([])
    render(<CashCountView auth={cajero} />)
    await screen.findByLabelText('Reposición de billetes')
    await user.click(screen.getByRole('button', { name: '+ Solicitar reposición' }))

    const dialogo = screen.getByRole('dialog', { name: 'Solicitar reposición de billetes' })
    expect(within(dialogo).getByText(/todavía no se puede pedir/)).toBeInTheDocument()
    expect(within(dialogo).getByRole('button', { name: 'Enviar solicitud' })).toBeDisabled()
  })

  it('avisa las divisas que quedaron por debajo del mínimo', async () => {
    mocks.obtenerAvisosReposicion.mockResolvedValue([aviso()])
    render(<CashCountView auth={cajero} />)
    await screen.findByTestId('total-USD')
    const seccion = await screen.findByLabelText('Reposición de billetes')
    expect(seccion).toHaveTextContent('Saldo bajo.')
    expect(seccion).toHaveTextContent('tenés $ 300 de $ 500')
    expect(seccion).toHaveTextContent('faltan')
    expect(screen.getByRole('button', { name: 'Solicitar reposición' })).toBeInTheDocument()
  })

  it('no muestra la sección si ninguna divisa está bajo el mínimo', async () => {
    render(<CashCountView auth={cajero} />)
    await screen.findByTestId('total-USD')
    // La sección existe siempre; lo que no aparece es el banner de alerta.
    expect(screen.getByLabelText('Reposición de billetes')).toBeInTheDocument()
    expect(screen.queryByText('Saldo bajo.')).not.toBeInTheDocument()
  })

  it('no deja pedir dos veces la misma divisa mientras está pendiente', async () => {
    mocks.obtenerAvisosReposicion.mockResolvedValue([aviso()])
    mocks.listarSolicitudes.mockResolvedValue([solicitud()])
    render(<CashCountView auth={cajero} />)
    // Hay que esperar al aviso, no solo a la sección: el contador de
    // pedidos pendientes llega después.
    expect(
      await screen.findByRole('button', { name: 'Pedido enviado' }),
    ).toBeDisabled()
  })

  it('muestra el estado de los pedidos que el cajero ya hizo', async () => {
    mocks.listarSolicitudes.mockResolvedValue([
      solicitud({ id: 7, estado: 'PENDIENTE', estadoDisplay: 'Pendiente' }),
      solicitud({
        id: 6, estado: 'RECHAZADA', estadoDisplay: 'Rechazada',
        motivo: 'Tesorería sin efectivo', fechaRespuesta: '2026-10-12T11:00:00-03:00',
      }),
    ])
    render(<CashCountView auth={cajero} />)
    // Hay que esperar a que lleguen los pedidos: la sección ya está en
    // pantalla desde el primer render.
    expect(await screen.findByText('Pendiente')).toBeInTheDocument()
    const seccion = screen.getByLabelText('Reposición de billetes')
    expect(seccion).toHaveTextContent('Rechazada')
    expect(seccion).toHaveTextContent('Tesorería sin efectivo')
  })

  it('pide el monto por defecto y precarga el que falta', async () => {
    const user = userEvent.setup()
    mocks.obtenerAvisosReposicion.mockResolvedValue([aviso()])
    mocks.crearSolicitud.mockResolvedValue(solicitud({ monto: 200 }))
    render(<CashCountView auth={cajero} />)
    await screen.findByTestId('total-USD')
    await user.click(await screen.findByRole('button', { name: 'Solicitar reposición' }))

    const dialogo = screen.getByRole('dialog', { name: 'Solicitar reposición de billetes' })
    // El monto viene precargado con el faltante.
    expect(within(dialogo).getByLabelText('Monto que necesitás (USD)')).toHaveValue(200)
    await user.click(within(dialogo).getByRole('button', { name: 'Enviar solicitud' }))

    expect(mocks.crearSolicitud).toHaveBeenCalledWith({
      caja: 1, moneda: 2, monto: '200', detalle: [], observacion: '',
    })
    expect(await screen.findByText(/Solicitud #7 enviada al administrador/)).toBeInTheDocument()
  })

  it('permite pedir billetes concretos además del monto', async () => {
    const user = userEvent.setup()
    mocks.obtenerAvisosReposicion.mockResolvedValue([aviso()])
    mocks.crearSolicitud.mockResolvedValue(solicitud({ monto: 300 }))
    render(<CashCountView auth={cajero} />)
    await screen.findByTestId('total-USD')
    await user.click(await screen.findByRole('button', { name: 'Solicitar reposición' }))

    const dialogo = screen.getByRole('dialog', { name: 'Solicitar reposición de billetes' })
    await user.type(within(dialogo).getByLabelText('Monto que necesitás (USD)'), '300')
    await user.type(within(dialogo).getByLabelText('Billete $ 100'), '3')
    await user.click(within(dialogo).getByRole('button', { name: 'Enviar solicitud' }))

    expect(mocks.crearSolicitud).toHaveBeenCalledWith(
      expect.objectContaining({
        monto: '300',
        detalle: [{ denominacion: 20, cantidad: 3 }],
      }),
    )
  })

  it('no deja enviar el pedido con monto inválido', async () => {
    const user = userEvent.setup()
    mocks.obtenerAvisosReposicion.mockResolvedValue([aviso()])
    render(<CashCountView auth={cajero} />)
    await screen.findByTestId('total-USD')
    await user.click(await screen.findByRole('button', { name: 'Solicitar reposición' }))
    const dialogo = screen.getByRole('dialog', { name: 'Solicitar reposición de billetes' })

    const campo = within(dialogo).getByLabelText('Monto que necesitás (USD)')
    await user.clear(campo)
    await user.type(campo, '0')
    expect(within(dialogo).getByRole('button', { name: 'Enviar solicitud' })).toBeDisabled()
    await user.type(campo, '5')
    await user.click(within(dialogo).getByRole('button', { name: 'Enviar solicitud' }))
    expect(mocks.crearSolicitud).toHaveBeenCalledWith(
      expect.objectContaining({ monto: '5' }),
    )
  })

  it('el saldo sigue mostrando si falla la carga de los avisos', async () => {
    mocks.obtenerAvisosReposicion.mockRejectedValue(new Error('sin permisos'))
    mocks.listarSolicitudes.mockRejectedValue(new Error('sin permisos'))
    render(<CashCountView auth={cajero} />)
    // El saldo es lo importante: si esto aparece, la pantalla no se rompió.
    expect(await screen.findByTestId('total-USD')).toHaveTextContent('400')
    // Y el botón de pedir sigue disponible: no depende de los avisos.
    expect(screen.getByRole('button', { name: '+ Solicitar reposición' })).toBeInTheDocument()
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
