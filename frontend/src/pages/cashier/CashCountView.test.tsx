/**
 * Pruebas PI-44: consultar y actualizar saldo de billetes por caja.
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
import type { Arqueo, MovimientoCaja, SaldoMoneda } from '@/services/cajas'
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
  }
})

const mocks = vi.mocked(cajas)

function saldo(usd100 = 3, usd20 = 5): SaldoMoneda[] {
  return [
    {
      moneda: 1, codigo: 'PYG', nombre: 'Guaraní', simbolo: '₲', decimales: 0, flag: '🇵🇾',
      total: 0, cantidadBilletes: 0,
      denominaciones: [{ denominacion: 10, valor: 100000, cantidad: 0, subtotal: 0 }],
    },
    {
      moneda: 2, codigo: 'USD', nombre: 'Dólar Americano', simbolo: '$', decimales: 2, flag: '🇺🇸',
      total: usd100 * 100 + usd20 * 20, cantidadBilletes: usd100 + usd20,
      denominaciones: [
        { denominacion: 20, valor: 100, cantidad: usd100, subtotal: usd100 * 100 },
        { denominacion: 21, valor: 20, cantidad: usd20, subtotal: usd20 * 20 },
      ],
    },
  ]
}

const movimiento: MovimientoCaja = {
  id: 7, tipo: 'INGRESO', tipoDisplay: 'Ingreso', monedaCodigo: 'USD', total: 200,
  usuarioNombre: 'Cajera Ana', observacion: '', creadoEn: '2026-10-08T12:00:00-03:00',
  detalle: [{ denominacion: 20, valor: 100, cantidad: 2, saldoResultante: 5 }],
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
})

async function abrirModalMovimiento() {
  const user = userEvent.setup()
  const { unmount } = render(<CashCountView auth={cajero} />)
  await screen.findByText('Billete $ 100')
  await user.click(screen.getByRole('button', { name: /Registrar movimiento/ }))
  return { user, unmount, dialogo: screen.getByRole('dialog', { name: 'Registrar movimiento de efectivo' }) }
}

describe('CashCountView (PI-44)', () => {
  it('muestra los billetes por denominación y el total de cada moneda', async () => {
    render(<CashCountView auth={cajero} />)
    expect(await screen.findByText('Billete $ 100')).toBeInTheDocument()
    expect(screen.getByText('Casa Central · Caja 1')).toBeInTheDocument()
    // Arranca en la primera moneda con billetes (USD), no en PYG vacío.
    expect(screen.getByTestId('total-USD')).toHaveTextContent('$ 400')
    expect(screen.getByText('Billete $ 20')).toBeInTheDocument()
    expect(screen.getByText(/Total en caja \(USD\)/)).toBeInTheDocument()
    expect(mocks.obtenerSaldo).toHaveBeenCalledWith(1)
  })

  it('cambia de moneda al elegir otro total', async () => {
    const user = userEvent.setup()
    render(<CashCountView auth={cajero} />)
    await screen.findByText('Billete $ 100')
    await user.click(screen.getByRole('button', { name: /PYG/ }))
    expect(screen.getByText(/Billete ₲ 100\.000/)).toBeInTheDocument()
  })

  it('registra un ingreso y actualiza el saldo en pantalla', async () => {
    mocks.registrarMovimiento.mockResolvedValue({ movimiento, saldo: saldo(5, 5) })
    const { user, dialogo } = await abrirModalMovimiento()
    await user.type(within(dialogo).getByLabelText(/Billete \$ 100/), '2')
    expect(within(dialogo).getByTestId('total-movimiento')).toHaveTextContent('$ 200')
    await user.click(within(dialogo).getByRole('button', { name: 'Confirmar movimiento' }))

    expect(mocks.registrarMovimiento).toHaveBeenCalledWith(1, {
      tipo: 'INGRESO', moneda: 2, detalle: [{ denominacion: 20, cantidad: 2 }], observacion: '',
    })
    expect(await screen.findByRole('status')).toHaveTextContent('Ingreso registrado')
    expect(screen.getByTestId('total-USD')).toHaveTextContent('$ 600')
    expect(screen.getByText('Cajera Ana', { exact: false })).toBeInTheDocument()
  })

  it('no deja confirmar un retiro mayor a los billetes disponibles', async () => {
    const { user, dialogo } = await abrirModalMovimiento()
    await user.selectOptions(within(dialogo).getByLabelText('Tipo'), 'RETIRO')
    await user.type(within(dialogo).getByLabelText(/Billete \$ 100/), '4')
    expect(within(dialogo).getByText(/No hay billetes suficientes/)).toBeInTheDocument()
    expect(within(dialogo).getByRole('button', { name: 'Confirmar movimiento' })).toBeDisabled()
    expect(mocks.registrarMovimiento).not.toHaveBeenCalled()
  })

  it('muestra el error que devuelve la API', async () => {
    mocks.registrarMovimiento.mockRejectedValue(new Error('La caja está inactiva.'))
    const { user, dialogo } = await abrirModalMovimiento()
    await user.type(within(dialogo).getByLabelText(/Billete \$ 20/), '1')
    await user.click(within(dialogo).getByRole('button', { name: 'Confirmar movimiento' }))
    expect(await within(dialogo).findByRole('alert')).toHaveTextContent('La caja está inactiva.')
  })

  it('la entrega a cajero solo aparece para el administrador', async () => {
    const { dialogo, unmount } = await abrirModalMovimiento()
    expect(within(dialogo).queryByRole('option', { name: 'Entrega a cajero' })).not.toBeInTheDocument()

    const user = userEvent.setup()
    unmount()
    render(<CashCountView auth={admin} />)
    await screen.findByText('Billete $ 100')
    await user.click(screen.getByRole('button', { name: /Registrar movimiento/ }))
    expect(screen.getByRole('option', { name: 'Entrega a cajero' })).toBeInTheDocument()
  })

  it('registra un arqueo con lo contado y muestra si hay diferencias', async () => {
    const arqueo: Arqueo = {
      id: 3, usuarioNombre: 'Ana', observacion: 'Cierre', conDiferencias: true,
      creadoEn: '2026-10-08T18:00:00-03:00',
      detalle: [{ denominacion: 20, monedaCodigo: 'USD', valor: 100, cantidadSistema: 3, cantidadContada: 2, diferencia: -1 }],
    }
    mocks.registrarArqueo.mockResolvedValue(arqueo)
    const user = userEvent.setup()
    render(<CashCountView auth={cajero} />)
    await screen.findByText('Billete $ 100')
    await user.click(screen.getByRole('button', { name: /Registrar arqueo/ }))
    const dialogo = screen.getByRole('dialog', { name: 'Registrar arqueo de caja' })
    const campo = within(dialogo).getByLabelText('$ 100')
    expect(campo).toHaveValue(3) // arranca con lo del sistema
    await user.clear(campo)
    await user.type(campo, '2')
    expect(within(dialogo).getByText('-1')).toBeInTheDocument()
    expect(within(dialogo).getByText('Hay diferencias en USD.')).toBeInTheDocument()
    await user.type(within(dialogo).getByPlaceholderText(/Cierre de turno/), 'Cierre')
    await user.click(within(dialogo).getByRole('button', { name: 'Guardar arqueo' }))

    expect(mocks.registrarArqueo).toHaveBeenCalledWith(1, [
      { denominacion: 20, cantidad: 2 },
      { denominacion: 21, cantidad: 5 },
    ], 'Cierre')
    expect(await screen.findByRole('status')).toHaveTextContent('CON diferencias')
    expect(screen.getByText('Con diferencias')).toBeInTheDocument()
  })

  it('el arqueo muestra una moneda por vez y arranca en la que tiene billetes', async () => {
    const user = userEvent.setup()
    render(<CashCountView auth={cajero} />)
    await screen.findByText('Billete $ 100')
    await user.click(screen.getByRole('button', { name: /Registrar arqueo/ }))
    const dialogo = screen.getByRole('dialog', { name: 'Registrar arqueo de caja' })
    expect(within(dialogo).getByRole('button', { name: 'USD', pressed: true })).toBeInTheDocument()
    expect(within(dialogo).queryByLabelText('₲ 100.000')).not.toBeInTheDocument()
    expect(within(dialogo).getByText('Todo coincide con el sistema.')).toBeInTheDocument()

    await user.click(within(dialogo).getByRole('button', { name: 'PYG' }))
    expect(within(dialogo).getByLabelText('₲ 100.000')).toBeInTheDocument()
    expect(within(dialogo).queryByLabelText('$ 100')).not.toBeInTheDocument()
  })

  it('bloquea el scroll de la página mientras el modal está abierto', async () => {
    const { user, dialogo } = await abrirModalMovimiento()
    expect(document.body.style.overflow).toBe('hidden')
    await user.click(within(dialogo).getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(document.body.style.overflow).toBe('')
  })

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
