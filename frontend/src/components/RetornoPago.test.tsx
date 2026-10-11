/**
 * Pruebas de la pantalla de retorno desde Stripe Checkout.
 *
 * Se simula `obtenerOperacion`: éxito al acreditarse (PAGADA),
 * cancelación con motivo PAGO_FALLIDO y error de verificación. La
 * confirmación real viene del webhook; acá solo se sondea el estado.
 *
 * @module components/RetornoPago.test
 */
import { afterEach, describe, it, expect, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@/services/operaciones', () => ({ obtenerOperacion: vi.fn(), iniciarPago: vi.fn() }))

import { iniciarPago, obtenerOperacion } from '@/services/operaciones'
import RetornoPago from '@/components/RetornoPago'

const obtenerMock = vi.mocked(obtenerOperacion)
const iniciarMock = vi.mocked(iniciarPago)

function operacion(estado: string, motivo = '') {
  return {
    id: 1, cliente: 1, cliente_nombre: 'Carlos', usuario_keycloak_id: 'sub',
    usuario_nombre: 'Carlos', tipo_operacion: 'COMPRA', moneda_origen: 1,
    moneda_origen_codigo: 'PYG', moneda_destino: 2, moneda_destino_codigo: 'USD',
    monto_enviado: 765000, monto_recibido: 100, cotizacion_aplicada: 7650,
    tasa_origen: null, tasa_destino: 7650, metodo_pago: 'transfer',
    billetera_destino: null, billetera_destino_detalle: '', cuenta_origen: null,
    cuenta_origen_detalle: '', billetera_origen: null, billetera_origen_detalle: '',
    fecha_creacion: new Date().toISOString(), estado, fecha_cotizacion: '',
    fecha_confirmacion: null, fecha_cancelacion: null, cancelada_por: '',
    cancelada_por_nombre: '', motivo_cancelacion: motivo, tolerancia_segundos: 30,
    segundos_restantes: 0,
  }
}

describe('RetornoPago', () => {
  afterEach(() => {
    cleanup()
    vi.resetAllMocks()
  })

  it('muestra éxito cuando el webhook ya la marcó PAGADA', async () => {
    obtenerMock.mockResolvedValue(operacion('PAGADA') as never)
    const historial = vi.fn()
    render(<RetornoPago opId={1} resultado="exito" onVerHistorial={historial} onReintentar={vi.fn()} />)
    expect(await screen.findByText('¡Pago acreditado!')).toBeInTheDocument()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Ver en historial' }))
    expect(historial).toHaveBeenCalled()
  })

  it('muestra el motivo cuando el pago fue rechazado o expiró', async () => {
    obtenerMock.mockResolvedValue(operacion('CANCELADA', 'PAGO_FALLIDO') as never)
    render(<RetornoPago opId={1} resultado="cancelado" onVerHistorial={vi.fn()} onReintentar={vi.fn()} />)
    expect(await screen.findByText('Pago no completado')).toBeInTheDocument()
    expect(screen.getByText(/el pago fue rechazado o expiró/)).toBeInTheDocument()
  })

  it('ofrece reintentar si sigue pendiente', async () => {
    vi.useFakeTimers()
    try {
      obtenerMock.mockResolvedValue(operacion('PENDIENTE') as never)
      const reintentar = vi.fn()
      render(<RetornoPago opId={1} resultado="cancelado" onVerHistorial={vi.fn()} onReintentar={reintentar} />)
      // Agota los reintentos del modo cancelado (10 sondeos).
      for (let i = 0; i < 11; i++) {
        await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
      }
      vi.useRealTimers()
      expect(await screen.findByText('Todavía no se acreditó el pago')).toBeInTheDocument()
      const user = userEvent.setup()
      await user.click(screen.getByRole('button', { name: 'Reintentar' }))
      expect(reintentar).toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('retoma la sesión de pago abierta', async () => {
    vi.useFakeTimers()
    try {
      obtenerMock.mockResolvedValue(operacion('PENDIENTE') as never)
      iniciarMock.mockResolvedValue({ url: 'https://checkout.stripe.com/pay/cs_x', session_id: 'cs_x' })
      render(<RetornoPago opId={1} resultado="cancelado" onVerHistorial={vi.fn()} onReintentar={vi.fn()} />)
      for (let i = 0; i < 11; i++) {
        await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
      }
      vi.useRealTimers()
      const user = userEvent.setup()
      await user.click(await screen.findByRole('button', { name: 'Volver al pago' }))
      expect(iniciarMock).toHaveBeenCalledWith(1)
    } finally {
      vi.useRealTimers()
    }
  })
})
