/**
 * Pruebas de facturas con datos reales (`GET /api/operaciones/`).
 *
 * La vista muestra solo operaciones cerradas: PAGADA → Aprobada,
 * CANCELADA → Rechazada.
 *
 * @module Invoices.test
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import Invoices from '@/pages/Invoices'

function respuesta(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function operacion(id: number, estado: string) {
  return {
    id, cliente: 1, cliente_nombre: 'Carlos Martínez',
    usuario_keycloak_id: 'sub', usuario_nombre: 'Carlos',
    tipo_operacion: 'COMPRA', moneda_origen: 1,
    moneda_origen_codigo: 'PYG', moneda_destino: 2,
    moneda_destino_codigo: 'USD', monto_enviado: '757500.00',
    monto_recibido: '100.00', cotizacion_aplicada: '7575.000000',
    tasa_origen: null, tasa_destino: '7575.00', metodo_pago: 'efectivo',
    billetera_destino: null, billetera_destino_detalle: '',
    cuenta_origen: null, cuenta_origen_detalle: '',
    billetera_origen: null, billetera_origen_detalle: '',
    fecha_creacion: '2024-01-15T14:00:00Z', estado,
    fecha_cotizacion: '2024-01-15T14:00:00Z',
    fecha_confirmacion: null, fecha_cancelacion: null,
    cancelada_por: '', cancelada_por_nombre: '',
    motivo_cancelacion: '', tolerancia_segundos: 300,
    segundos_restantes: 300,
  }
}

describe('Invoices (datos reales)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('/operaciones/')) {
        return respuesta([
          operacion(9, 'PAGADA'),
          operacion(8, 'CANCELADA'),
          operacion(7, 'PENDIENTE'),
        ])
      }
      return respuesta({}, 404)
    }))
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('muestra tarjetas, tabla y estados desde la API', async () => {
    render(<Invoices />)
    expect(await screen.findByText('F001-0009')).toBeInTheDocument()
    expect(screen.getByText('Total facturas')).toBeInTheDocument()
    expect(screen.getByText('Aprobadas')).toBeInTheDocument()
    expect(screen.getByText('Rechazadas')).toBeInTheDocument()
    expect(screen.getByText('F001-0008')).toBeInTheDocument()
    expect(screen.getAllByText('Aprobada').length).toBeGreaterThan(0)
    expect(screen.getByText('Rechazada')).toBeInTheDocument()
    // Las pendientes no son facturas y no se listan.
    expect(screen.queryByText('Emitidas/Pendientes')).not.toBeInTheDocument()
    expect(screen.queryByText('F001-0007')).not.toBeInTheDocument()
  })

  it('muestra el error del backend', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respuesta({ detail: 'Error' }, 500)))
    render(<Invoices />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Error')
  })

  it('marca Rechazada la operación con comprobante anulado', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('/comprobantes/')) {
        return respuesta([{ ...operacion(9, 'PAGADA'), estado: 'anulado', operacion: 9 }])
      }
      if (String(url).includes('/operaciones/')) {
        return respuesta([operacion(9, 'PAGADA')])
      }
      return respuesta({}, 404)
    }))
    render(<Invoices />)
    expect(await screen.findByText('F001-0009')).toBeInTheDocument()
    expect(screen.getByText('Rechazada')).toBeInTheDocument()
    expect(screen.queryByText('Aprobada')).not.toBeInTheDocument()
  })
})
