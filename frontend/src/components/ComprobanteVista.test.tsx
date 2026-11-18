/**
 * Pruebas PI-42 de la vista imprimible del comprobante.
 *
 * @module ComprobanteVista.test
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { usoFacturas, type FacturaElectronica } from '@/services/facturas'
import { descargarDocumentoOficial } from '@/services/facturasDescarga'
import ComprobanteVista from '@/components/ComprobanteVista'
import type { Comprobante } from '@/services/comprobantes'
vi.mock('@/services/facturasDescarga', () => ({ descargarDocumentoOficial: vi.fn() }))

// El bloque de factura electrónica (PI-30) consulta la API: se simula.
vi.mock('@/services/facturas', async (original) => ({
  ...(await original<typeof import('@/services/facturas')>()),
  usoFacturas: vi.fn().mockResolvedValue({
    modo: 'simulado', usadas: 0, limite: 12, disponibles: 12,
    siguiente_numero: '0000100', operacion_estado: 'PAGADA',
    email_cliente: 'ana@test.com', factura: null,
  }),
}))

const comprobante: Comprobante = {
  id: 1, numero: 'CPB-000001', operacion: 9,
  cliente_nombre: 'Ana Barrios', cliente_documento: '4589201',
  tipo_operacion: 'COMPRA', moneda_origen_codigo: 'PYG',
  moneda_destino_codigo: 'USD', monto_enviado: 757500,
  monto_recibido: 100, tasa_origen: 1, tasa_destino: 7500,
  monto_comision: 7500, metodo_pago: 'efectivo',
  fecha_operacion: '2026-10-11T10:00:00Z',
  cajero_sub: 'sub-caja', cajero_nombre: 'Cajero',
  estado: 'emitido', motivo_anulacion: '', anulado_por_nombre: '',
  fecha_anulacion: null, creado: '2026-10-11T10:00:00Z',
}

describe('ComprobanteVista (recibo interno)', () => {
  it('el botón del modal descarga el KuDE oficial de la factura aprobada', async () => {
    const factura: FacturaElectronica = {
      id: 12, operacion: 9, cliente_nombre: 'Ana', simulada: false,
      numero: '0000103', numero_completo: '001-003-0000103', cdc: '1'.repeat(44),
      estado: 'APROBADA', total: 7500, email_destino: 'ana@test.com', detalle: '',
      envio_fecha: null, envio_destinatario: '', envio_resultado: '', creada: '', estado_consultado: null,
    }
    vi.mocked(usoFacturas).mockResolvedValueOnce({
      modo: 'real', usadas: 1, limite: 12, disponibles: 11, siguiente_numero: '0000104',
      operacion: 9, operacion_estado: 'PAGADA', email_cliente: 'ana@test.com', factura,
    })
    vi.mocked(descargarDocumentoOficial).mockResolvedValue()
    render(<ComprobanteVista comprobante={comprobante} onClose={() => {}} />)
    const boton = await screen.findByRole('button', { name: 'Descargar PDF' })
    expect(boton).toBeEnabled()
    fireEvent.click(boton)
    await waitFor(() => expect(descargarDocumentoOficial).toHaveBeenCalledWith(factura, 'kude'))
  })
  it('muestra número, cliente, montos y cajero', () => {
    render(<ComprobanteVista comprobante={comprobante} onClose={() => {}} />)
    expect(screen.getByText('CPB-000001')).toBeInTheDocument()
    expect(screen.getByText('Ana Barrios')).toBeInTheDocument()
    expect(screen.getByText(/757[.,]?500/)).toBeInTheDocument()
    expect(screen.getByText(/100 USD/)).toBeInTheDocument()
    expect(screen.getByText('Cajero')).toBeInTheDocument()
    // Solo se usa factura electrónica: ya no se aclara "comprobante interno".
    expect(screen.getByText('Comprobante de operación')).toBeInTheDocument()
    expect(screen.queryByText(/no es factura electrónica/)).not.toBeInTheDocument()
  })

  it('ofrece imprimir, descargar PDF y cerrar', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<ComprobanteVista comprobante={comprobante} onClose={onClose} />)
    expect(screen.getByRole('button', { name: '🖨️ Imprimir' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Procesando SIFEN...' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
