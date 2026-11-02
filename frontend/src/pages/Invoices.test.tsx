/**
 * Pruebas de la pantalla de facturas (PI-28 / PI-86).
 *
 * PI-28 se mantiene: filas por operación, tres estados con color, motivo
 * de rechazo, filtros por estado y fechas, refresco sin recargar.
 *
 * PI-86 agrega: el PDF por fila solo se habilita cuando la factura
 * electrónica de PI-30 está APROBADA (rechazadas, pendientes y sin
 * emitir quedan bloqueadas) y el CSV exporta solo las filas filtradas.
 *
 * @module Invoices.test
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import Invoices from '@/pages/Invoices'

vi.mock('@/services/facturasDescarga', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/facturasDescarga')>()
  return {
    ...actual,
    descargarFacturaPdf: vi.fn(),
    descargarFacturasCsv: vi.fn(),
  }
})

import {
  descargarFacturaPdf,
  descargarFacturasCsv,
} from '@/services/facturasDescarga'
import type { EstadoFactura } from '@/services/facturas'

const pdfMock = vi.mocked(descargarFacturaPdf)
const csvMock = vi.mocked(descargarFacturasCsv)

function respuesta(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function operacion(id: number, estado: string, extra: Record<string, unknown> = {}) {
  return {
    id, cliente: 1, cliente_nombre: 'Carlos Martínez',
    usuario_keycloak_id: 'sub', usuario_nombre: 'Carlos',
    tipo_operacion: 'COMPRA', moneda_origen: 1,
    moneda_origen_codigo: 'PYG', moneda_destino: 2,
    moneda_destino_codigo: 'USD', monto_enviado: 757500,
    monto_recibido: 100, cotizacion_aplicada: 7575,
    tasa_origen: null, tasa_destino: 7575, metodo_pago: 'efectivo',
    billetera_destino: null, billetera_destino_detalle: '',
    cuenta_origen: null, cuenta_origen_detalle: '',
    billetera_origen: null, billetera_origen_detalle: '',
    fecha_creacion: '2024-01-15T14:00:00Z', estado,
    fecha_cotizacion: '2024-01-15T14:00:00Z',
    fecha_confirmacion: null, fecha_cancelacion: null,
    cancelada_por: '', cancelada_por_nombre: '',
    motivo_cancelacion: '', tolerancia_segundos: 300,
    segundos_restantes: 300,
    ...extra,
  }
}

/** Factura electrónica de PI-30 tal como la devuelve `GET /api/facturas/`. */
function facturaApi(operacionId: number, estado: EstadoFactura, extra: Record<string, unknown> = {}) {
  return {
    id: operacionId * 10,
    operacion: operacionId,
    cliente_nombre: 'Carlos Martínez',
    simulada: true,
    numero: '0000100',
    numero_completo: '001-003-0000100',
    cdc: '0180069560101101199369560110100000100000101a1b2c3d',
    estado,
    total: 757500,
    email_destino: 'carlos@test.com',
    detalle: '',
    respuesta_servicio: {},
    envio_fecha: null,
    envio_destinatario: '',
    envio_resultado: '',
    emitida_por_nombre: 'Cajero',
    creada: '2024-01-15T15:00:00Z',
    actualizada: '2024-01-15T15:00:00Z',
    estado_consultado: null,
    ...extra,
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
    return respuesta([], 200)
  }))
}

describe('Invoices (PI-28 + PI-86)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

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
      return respuesta([], 200)
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
      return respuesta([], 200)
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
      return respuesta([], 200)
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
      return respuesta([], 200)
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<Invoices />)

    expect(await screen.findByText('F001-0009')).toBeInTheDocument()
    const llamadas = fetchMock.mock.calls.length
    fireEvent.click(screen.getByRole('button', { name: /actualizar/i }))
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(llamadas))
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

  it('muestra el número de la factura electrónica cuando existe', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('/operaciones/')) {
        return respuesta([operacion(9, 'PAGADA'), operacion(7, 'PENDIENTE')])
      }
      if (String(url).includes('/facturas/')) {
        return respuesta([{ ...facturaApi(9, 'APROBADA'), puede_gestionar: true }])
      }
      return respuesta([], 200)
    }))
    render(<Invoices />)

    expect(await screen.findByText('F001-0009')).toBeInTheDocument()
    expect(screen.getByText('001-003-0000100')).toBeInTheDocument()
    expect(screen.getAllByText('—')).toHaveLength(1)
  })

  it('descarga el PDF de una factura aprobada por SIFEN', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('/operaciones/')) {
        return respuesta([operacion(9, 'PAGADA')])
      }
      if (String(url).includes('/facturas/')) {
        return respuesta([{ ...facturaApi(9, 'APROBADA'), puede_gestionar: true }])
      }
      return respuesta([], 200)
    }))
    render(<Invoices />)

    const boton = await screen.findByRole('button', {
      name: 'Descargar factura 001-003-0000100',
    })
    expect(boton).toBeEnabled()
    fireEvent.click(boton)

    expect(pdfMock).toHaveBeenCalledTimes(1)
    expect(pdfMock).toHaveBeenCalledWith(
      expect.objectContaining({ numero_completo: '001-003-0000100', estado: 'APROBADA' }),
      expect.objectContaining({ id: 9 }),
    )
  })

  it('no descarga facturas rechazadas, pendientes o sin emitir', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('/operaciones/')) {
        return respuesta([operacion(9, 'PAGADA'), operacion(8, 'PAGADA'), operacion(7, 'PENDIENTE')])
      }
      if (String(url).includes('/facturas/')) {
        return respuesta([
          facturaApi(9, 'APROBADA'),
          facturaApi(8, 'RECHAZADA', { detalle: 'RUC inválido' }),
        ])
      }
      return respuesta([], 200)
    }))
    render(<Invoices />)

    const rechazada = await screen.findByRole('button', {
      name: 'PDF no disponible: SIFEN rechazó la factura: RUC inválido',
    })
    const sinEmitir = screen.getByRole('button', {
      name: 'PDF no disponible: Todavía no se emitió la factura electrónica de esta operación.',
    })

    expect(rechazada).toBeDisabled()
    expect(sinEmitir).toBeDisabled()
    fireEvent.click(rechazada)
    fireEvent.click(sinEmitir)
    expect(pdfMock).not.toHaveBeenCalled()
  })

  it('bloquea también el PDF de una factura emitida sin aprobar', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('/operaciones/')) {
        return respuesta([operacion(9, 'PAGADA')])
      }
      if (String(url).includes('/facturas/')) {
        return respuesta([facturaApi(9, 'EMITIDA')])
      }
      return respuesta([], 200)
    }))
    render(<Invoices />)

    const emitida = await screen.findByRole('button', {
      name: 'PDF no disponible: La factura todavía no está aprobada por SIFEN.',
    })
    expect(emitida).toBeDisabled()
    fireEvent.click(emitida)
    expect(pdfMock).not.toHaveBeenCalled()
  })

  it('exporta a CSV solo las filas filtradas', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('/operaciones/')) {
        return respuesta([
          operacion(9, 'PAGADA'),
          operacion(8, 'CANCELADA'),
          operacion(7, 'PENDIENTE'),
        ])
      }
      if (String(url).includes('/facturas/')) {
        return respuesta([{ ...facturaApi(9, 'APROBADA'), puede_gestionar: true }])
      }
      return respuesta([], 200)
    }))
    render(<Invoices />)

    expect(await screen.findByText('F001-0009')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Aprobada' } })
    await waitFor(() => expect(screen.queryByText('F001-0008')).not.toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /exportar csv/i }))

    expect(csvMock).toHaveBeenCalledTimes(1)
    const [filas, filtros] = csvMock.mock.calls[0]
    expect(filas.map(f => f.operacion.id)).toEqual([9])
    expect(filas[0].factura?.numero_completo).toBe('001-003-0000100')
    expect(filtros).toEqual({ estado: 'Aprobada', desde: '', hasta: '' })
  })

  it('deshabilita la exportación cuando no hay filas', async () => {
    mockTresEstados()
    render(<Invoices />)

    expect(await screen.findByText('F001-0009')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2024-02-01' } })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /exportar csv/i })).toBeDisabled()
    })
  })

  it('solo ofrece Gestionar a un administrador o cajero', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('/operaciones/')) {
        return respuesta([operacion(9, 'PAGADA')])
      }
      if (String(url).includes('/facturas/')) {
        return respuesta([{ ...facturaApi(9, 'APROBADA'), puede_gestionar: true }])
      }
      return respuesta([], 200)
    }))
    const { rerender } = render(
      <Invoices auth={{ name: 'Ana', email: 'ana@test.com', role: 'user', avatar: '' }} />,
    )

    expect(await screen.findByText('F001-0009')).toBeInTheDocument()
    expect(screen.queryByRole('combobox', {
      name: 'Operación de factura',
    })).not.toBeInTheDocument()

    rerender(
      <Invoices auth={{ name: 'Caja', email: 'caja@test.com', role: 'cashier', avatar: '' }} />,
    )
    expect(await screen.findByRole('combobox', {
      name: 'Operación de factura',
    })).toBeInTheDocument()
  })
})
