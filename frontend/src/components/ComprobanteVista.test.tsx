/**
 * Pruebas PI-42 de la vista imprimible del comprobante.
 *
 * @module ComprobanteVista.test
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import ComprobanteVista from '@/components/ComprobanteVista'
import type { Comprobante } from '@/services/comprobantes'

const comprobante: Comprobante = {
  id: 1, numero: 'CPB-000001', operacion: 9,
  cliente_nombre: 'Ana Barrios', cliente_documento: '4589201',
  tipo_operacion: 'COMPRA', moneda_origen_codigo: 'PYG',
  moneda_destino_codigo: 'USD', monto_enviado: 757500,
  monto_recibido: 100, tasa_origen: 1, tasa_destino: 7500,
  monto_comision: 7500, metodo_pago: 'efectivo',
  fecha_operacion: '2026-10-11T10:00:00Z',
  cajero_sub: 'sub-caja', cajero_nombre: 'Cajero',
  estado: 'emitido', creado: '2026-10-11T10:00:00Z',
}

describe('ComprobanteVista (recibo interno)', () => {
  it('muestra número, cliente, montos y cajero', () => {
    render(<ComprobanteVista comprobante={comprobante} onClose={() => {}} />)
    expect(screen.getByText('CPB-000001')).toBeInTheDocument()
    expect(screen.getByText('Ana Barrios')).toBeInTheDocument()
    expect(screen.getByText(/757[.,]?500/)).toBeInTheDocument()
    expect(screen.getByText(/100 USD/)).toBeInTheDocument()
    expect(screen.getByText('Cajero')).toBeInTheDocument()
    expect(screen.getByText('Comprobante interno, no es factura electrónica.')).toBeInTheDocument()
  })

  it('ofrece imprimir, descargar PDF y cerrar', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<ComprobanteVista comprobante={comprobante} onClose={onClose} />)
    expect(screen.getByRole('button', { name: '🖨️ Imprimir' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '📥 Descargar PDF' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
