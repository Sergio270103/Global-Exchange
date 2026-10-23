/**
 * Pruebas de facturas con datos reales (`GET /api/operaciones/`).
 *
 * PI-28: los tres estados (Emitida/Aprobada/Rechazada) se distinguen por
 * color, las rechazadas muestran el motivo, el botón Actualizar refresca
 * sin recargar y hay filtros por estado y rango de fechas. La restricción
 * "el cliente ve solo lo suyo / el admin ve todo" la hace el backend
 * (cubierta en `backend/operaciones/test_historial.py`).
 *
 * @module Invoices.test
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
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

/** Mock base: una operación de cada estado (PAGADA, CANCELADA, PENDIENTE). */
function mockTresEstados() {
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
}

describe('Invoices (datos reales)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('muestra tarjetas, tabla y los tres estados desde la API', async () => {
    mockTresEstados()
    render(<Invoices />)
    expect(await screen.findByText('F001-0009')).toBeInTheDocument()
    expect(screen.getByText('Total facturas')).toBeInTheDocument()
    expect(screen.getByText('Emitidas')).toBeInTheDocument()
    expect(screen.getByText('Aprobadas')).toBeInTheDocument()
    expect(screen.getByText('Rechazadas')).toBeInTheDocument()
    expect(screen.getByText('F001-0008')).toBeInTheDocument()
    expect(screen.getByText('F001-0007')).toBeInTheDocument()

    const tabla = screen.getByRole('table')
    expect(within(tabla).getByText('Aprobada')).toBeInTheDocument()
    expect(within(tabla).getByText('Rechazada')).toBeInTheDocument()
    expect(within(tabla).getByText('Emitida')).toBeInTheDocument()
  })

  it('distingue cada estado por color', async () => {
    mockTresEstados()
    render(<Invoices />)
    const tabla = await screen.findByRole('table')
    expect(within(tabla).getByText('Emitida')).toHaveClass('bg-amber-50')
    expect(within(tabla).getByText('Aprobada')).toHaveClass('bg-emerald-50')
    expect(within(tabla).getByText('Rechazada')).toHaveClass('bg-red-50')
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
    const tabla = await screen.findByRole('table')
    expect(within(tabla).getByText('Rechazada')).toBeInTheDocument()
    expect(within(tabla).queryByText('Aprobada')).not.toBeInTheDocument()
  })

  it('muestra el motivo cargado al anular el comprobante', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('/comprobantes/')) {
        return respuesta([{
          ...operacion(9, 'PAGADA'),
          estado: 'anulado',
          operacion: 9,
          motivo_anulacion: 'El cliente desistió de la operación.',
        }])
      }
      if (String(url).includes('/operaciones/')) {
        return respuesta([operacion(9, 'PAGADA')])
      }
      return respuesta({}, 404)
    }))
    render(<Invoices />)
    expect(await screen.findByText('F001-0009')).toBeInTheDocument()
    expect(await screen.findByText('El cliente desistió de la operación.')).toBeInTheDocument()
  })

  it('traduce el motivo interno de una operación cancelada', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('/operaciones/')) {
        return respuesta([{ ...operacion(8, 'CANCELADA'), motivo_cancelacion: 'DESISTIO' }])
      }
      return respuesta({}, 404)
    }))
    render(<Invoices />)
    expect(await screen.findByText('F001-0008')).toBeInTheDocument()
    expect(await screen.findByText('Desistió')).toBeInTheDocument()
  })

  it('refresca las facturas con el botón Actualizar sin recargar', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('/operaciones/')) {
        return respuesta([operacion(9, 'PAGADA')])
      }
      return respuesta({}, 404)
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<Invoices />)
    expect(await screen.findByText('F001-0009')).toBeInTheDocument()
    const llamadas = fetchMock.mock.calls.length
    fireEvent.click(screen.getByRole('button', { name: /actualizar/i }))
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(llamadas))
    // El refresco no vacía la tabla: la fila sigue visible.
    expect(screen.getByText('F001-0009')).toBeInTheDocument()
  })

  it('filtra las facturas por estado desde el selector', async () => {
    mockTresEstados()
    render(<Invoices />)
    expect(await screen.findByText('F001-0009')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Rechazada' } })
    await waitFor(() => expect(screen.queryByText('F001-0009')).not.toBeInTheDocument())
    expect(screen.getByText('F001-0008')).toBeInTheDocument()
    expect(screen.queryByText('F001-0007')).not.toBeInTheDocument()
  })

  it('filtra las facturas emitidas', async () => {
    mockTresEstados()
    render(<Invoices />)
    expect(await screen.findByText('F001-0007')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Emitida' } })
    await waitFor(() => expect(screen.queryByText('F001-0009')).not.toBeInTheDocument())
    expect(screen.getByText('F001-0007')).toBeInTheDocument()
    expect(screen.queryByText('F001-0008')).not.toBeInTheDocument()
  })

  it('filtra las facturas por rango de fechas', async () => {
    mockTresEstados()
    render(<Invoices />)
    expect(await screen.findByText('F001-0009')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2024-02-01' } })
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2024-12-31' } })
    await waitFor(() => expect(screen.queryByText('F001-0009')).not.toBeInTheDocument())
    expect(screen.queryByText('F001-0008')).not.toBeInTheDocument()
    expect(screen.queryByText('F001-0007')).not.toBeInTheDocument()
  })

  it('limpia los filtros y vuelve a mostrar todo', async () => {
    mockTresEstados()
    render(<Invoices />)
    expect(await screen.findByText('F001-0009')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Rechazada' } })
    await waitFor(() => expect(screen.queryByText('F001-0009')).not.toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /limpiar filtros/i }))
    await waitFor(() => expect(screen.getByText('F001-0009')).toBeInTheDocument())
  })
})
