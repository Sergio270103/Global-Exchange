/**
 * Pruebas del modal de gestión SIFEN de una factura.
 *
 * Los servicios están simulados: estas pruebas nunca llaman a la API ni
 * descargan archivos reales.
 *
 * @module GestionFactura.test
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import GestionFactura from '@/components/GestionFactura'
import {
  cancelarFactura,
  consultarCancelacion,
  consultarEstadoNotaCredito,
  consultarInutilizacion,
  emitirNotaCredito,
  inutilizarFactura,
  type EventoSIFEN,
  type NotaCreditoElectronica,
} from '@/services/facturas'
import {
  descargarNotaCreditoOficial,
  type FacturaElectronicaCompleta,
} from '@/services/facturasDescarga'

vi.mock('@/services/facturas', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/facturas')>()
  return {
    ...actual,
    cancelarFactura: vi.fn(),
    consultarCancelacion: vi.fn(),
    consultarEstadoNotaCredito: vi.fn(),
    consultarInutilizacion: vi.fn(),
    emitirNotaCredito: vi.fn(),
    inutilizarFactura: vi.fn(),
  }
})

vi.mock('@/services/facturasDescarga', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/facturasDescarga')>()
  return {
    ...actual,
    descargarNotaCreditoOficial: vi.fn(),
  }
})

const cancelarMock = vi.mocked(cancelarFactura)
const consultarCancelacionMock = vi.mocked(consultarCancelacion)
const consultarInutilizacionMock = vi.mocked(consultarInutilizacion)
const emitirNcMock = vi.mocked(emitirNotaCredito)
const inutilizarMock = vi.mocked(inutilizarFactura)
const consultarNcMock = vi.mocked(consultarEstadoNotaCredito)
const descargarNcMock = vi.mocked(descargarNotaCreditoOficial)

function factura(extra: Partial<FacturaElectronicaCompleta> = {}): FacturaElectronicaCompleta {
  return {
    id: 10,
    operacion: 9,
    cliente_nombre: 'Carlos Martínez',
    simulada: true,
    numero: '0000100',
    numero_completo: '001-003-0000100',
    cdc: '0180069560101101199369560110100000100000101a1b2c3d',
    estado: 'APROBADA',
    total: 757500,
    email_destino: 'carlos@test.com',
    detalle: '',
    envio_fecha: null,
    envio_destinatario: '',
    envio_resultado: '',
    creada: '2026-10-24T15:00:00Z',
    estado_consultado: null,
    emitida_por_nombre: 'Cajero',
    estado_cancelacion: '',
    estado_inutilizacion: '',
    cancelacion_solicitada: null,
    cancelacion_consultada: null,
    cancelacion_detalle: '',
    inutilizacion_solicitada: null,
    inutilizacion_consultada: null,
    inutilizacion_detalle: '',
    cancelada_por_nombre: '',
    inutilizada_por_nombre: '',
    puede_cancelar: true,
    puede_inutilizar: false,
    puede_nota_credito: true,
    eventos: [],
    notas_credito: [],
    ...extra,
  }
}

function evento(extra: Partial<EventoSIFEN> = {}): EventoSIFEN {
  return {
    id: 1,
    factura: 10,
    tipo: 'CANCELACION',
    tipo_display: 'Cancelación',
    estado: 'PENDIENTE',
    estado_display: 'Pendiente de SIFEN',
    cdc_evento: '0180069560101101199369560110100000100000101a1b2c3d',
    motivo: '',
    solicitado_por_nombre: 'Cajero',
    solicitado: '2026-10-24T15:01:00Z',
    consultado: null,
    detalle: 'Solicitud enviada.',
    respuesta_solicitud: {},
    respuesta_consulta: {},
    ...extra,
  }
}

function nota(extra: Partial<NotaCreditoElectronica> = {}): NotaCreditoElectronica {
  return {
    id: 3,
    factura: 10,
    factura_numero: '001-003-0000100',
    cliente_nombre: 'Carlos Martínez',
    simulada: true,
    numero: '0000013',
    numero_completo: '001-003-0000013',
    cdc: '0180069560101101199369560110100000130000131a1b2c3d',
    estado: 'EMITIDA',
    estado_display: 'Emitida',
    total: 757500,
    motivo: '5',
    motivo_display: 'Ajuste de precio',
    email_destino: 'nc@test.com',
    detalle: 'Generada.',
    respuesta_servicio: {},
    envio_fecha: null,
    envio_destinatario: '',
    envio_resultado: '',
    emitida_por_nombre: 'Cajero',
    creada: '2026-10-24T15:05:00Z',
    actualizada: '2026-10-24T15:05:00Z',
    estado_consultado: null,
    ...extra,
  }
}

describe('GestionFactura', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('emite una nota de crédito con motivo y correo editables', async () => {
    const onActualizada = vi.fn()
    emitirNcMock.mockResolvedValue(nota())
    render(<GestionFactura factura={factura()} onActualizada={onActualizada} />)

    fireEvent.click(screen.getByRole('button', {
      name: 'Gestionar factura 001-003-0000100',
    }))
    expect(screen.getByRole('dialog', { name: 'Gestión SIFEN' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Emitir nota de crédito/ }))
    fireEvent.change(screen.getByLabelText('Motivo de la nota de crédito'), {
      target: { value: '7' },
    })
    fireEvent.change(screen.getByLabelText('Correo del cliente'), {
      target: { value: 'nc@test.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar nota de crédito' }))

    await waitFor(() => {
      expect(emitirNcMock).toHaveBeenCalledWith(10, '7', 'nc@test.com')
    })
    expect(await screen.findByText(/Nota de crédito 001-003-0000013 emitida/))
      .toBeInTheDocument()
    expect(onActualizada).toHaveBeenCalled()
  })

  it('pide confirmación antes de anular y envía el motivo interno', async () => {
    const onActualizada = vi.fn()
    cancelarMock.mockResolvedValue({
      factura: factura({ estado_cancelacion: 'PENDIENTE' }),
      evento: evento(),
    })
    render(<GestionFactura factura={factura()} onActualizada={onActualizada} />)

    fireEvent.click(screen.getByRole('button', {
      name: 'Gestionar factura 001-003-0000100',
    }))
    fireEvent.click(screen.getByRole('button', { name: /Anular comprobante/ }))
    expect(screen.getByText(/Se enviará/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Motivo de la anulación'), {
      target: { value: 'El cliente desistió' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar anulación' }))

    await waitFor(() => {
      expect(cancelarMock).toHaveBeenCalledWith(10, 'El cliente desistió')
    })
    expect(await screen.findByText(/Solicitud de anulación enviada/)).toBeInTheDocument()
    expect(onActualizada).toHaveBeenCalled()
  })

  it('inutiliza el número de una factura rechazada', async () => {
    const onActualizada = vi.fn()
    inutilizarMock.mockResolvedValue({
      factura: factura({
        estado: 'RECHAZADA',
        puede_cancelar: false,
        puede_inutilizar: false,
        puede_nota_credito: false,
        estado_inutilizacion: 'PENDIENTE',
      }),
      evento: evento({
        tipo: 'INUTILIZACION',
        tipo_display: 'Inutilización',
      }),
    })
    render(
      <GestionFactura
        factura={factura({
          estado: 'RECHAZADA',
          puede_cancelar: false,
          puede_inutilizar: true,
          puede_nota_credito: false,
        })}
        onActualizada={onActualizada}
      />,
    )

    fireEvent.click(screen.getByRole('button', {
      name: 'Gestionar factura 001-003-0000100',
    }))
    fireEvent.click(screen.getByRole('button', { name: /Inutilizar número/ }))
    fireEvent.change(screen.getByLabelText('Motivo de la inutilización'), {
      target: { value: 'Número rechazado' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar inutilización' }))

    await waitFor(() => {
      expect(inutilizarMock).toHaveBeenCalledWith(10, 'Número rechazado')
    })
    expect(await screen.findByText(/Solicitud de inutilización enviada/))
      .toBeInTheDocument()
    expect(onActualizada).toHaveBeenCalled()
  })

  it('consulta la cancelación pendiente en SIFEN', async () => {
    consultarCancelacionMock.mockResolvedValue({
      factura: factura({
        estado_cancelacion: 'APROBADA',
        cancelacion_detalle: 'Cancelación aprobada',
      }),
      evento: evento({
        estado: 'APROBADA',
        estado_display: 'Aprobado por SIFEN',
        detalle: 'Cancelación aprobada',
      }),
    })
    render(
      <GestionFactura
        factura={factura({
          estado_cancelacion: 'PENDIENTE',
          puede_cancelar: false,
        })}
        onActualizada={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', {
      name: 'Gestionar factura 001-003-0000100',
    }))
    fireEvent.click(screen.getByRole('button', { name: /Consultar cancelación/ }))

    await waitFor(() => expect(consultarCancelacionMock).toHaveBeenCalledWith(10))
    expect(await screen.findByText('Cancelación aprobada por SIFEN.')).toBeInTheDocument()
  })

  it('consulta la inutilización pendiente en SIFEN', async () => {
    consultarInutilizacionMock.mockResolvedValue({
      factura: factura({
        estado: 'RECHAZADA',
        estado_inutilizacion: 'APROBADA',
        puede_cancelar: false,
        puede_inutilizar: false,
        puede_nota_credito: false,
      }),
      evento: evento({
        tipo: 'INUTILIZACION',
        tipo_display: 'Inutilización',
        estado: 'APROBADA',
        detalle: 'Inutilización aprobada',
      }),
    })
    render(
      <GestionFactura
        factura={factura({
          estado: 'RECHAZADA',
          estado_inutilizacion: 'PENDIENTE',
          puede_cancelar: false,
          puede_inutilizar: false,
          puede_nota_credito: false,
        })}
        onActualizada={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', {
      name: 'Gestionar factura 001-003-0000100',
    }))
    fireEvent.click(screen.getByRole('button', { name: /Consultar inutilización/ }))

    await waitFor(() => expect(consultarInutilizacionMock).toHaveBeenCalledWith(10))
    expect(await screen.findByText('Inutilización aprobada por SIFEN.'))
      .toBeInTheDocument()
  })

  it('descarga el KuDE y el XML oficiales de una NC aprobada', async () => {
    descargarNcMock.mockResolvedValue(undefined)
    const resumen = {
      id: 3,
      numero: '0000013',
      numero_completo: '001-003-0000013',
      cdc: '0180069560101101199369560110100000130000131a1b2c3d',
      estado: 'APROBADA' as const,
      total: 757500,
      motivo: '5',
      motivo_display: 'Ajuste de precio',
      detalle: 'Aprobada',
      creada: '2026-10-24T15:05:00Z',
      simulada: false,
    }
    render(
      <GestionFactura
        factura={factura({
          puede_cancelar: false,
          puede_nota_credito: false,
          notas_credito: [resumen],
        })}
        onActualizada={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', {
      name: 'Gestionar factura 001-003-0000100',
    }))
    fireEvent.click(screen.getByRole('button', {
      name: 'Descargar KuDE NC 001-003-0000013',
    }))
    await waitFor(() => {
      expect(descargarNcMock).toHaveBeenCalledWith(resumen, 'kude')
    })

    fireEvent.click(screen.getByRole('button', {
      name: 'Descargar XML NC 001-003-0000013',
    }))
    await waitFor(() => {
      expect(descargarNcMock).toHaveBeenCalledWith(resumen, 'xml')
    })
  })

  it('consulta el estado de una NC emitida', async () => {
    consultarNcMock.mockResolvedValue(nota({
      estado: 'APROBADA',
      estado_display: 'Aprobada',
      detalle: 'Aprobada por SIFEN',
    }))
    render(
      <GestionFactura
        factura={factura({
          puede_cancelar: false,
          puede_nota_credito: false,
          notas_credito: [{
            id: 3,
            numero: '0000013',
            numero_completo: '001-003-0000013',
            cdc: '0180069560101101199369560110100000130000131a1b2c3d',
            estado: 'EMITIDA',
            total: 757500,
            motivo: '5',
            motivo_display: 'Ajuste de precio',
            detalle: '',
            creada: '2026-10-24T15:05:00Z',
            simulada: true,
          }],
        })}
        onActualizada={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', {
      name: 'Gestionar factura 001-003-0000100',
    }))
    fireEvent.click(screen.getByRole('button', { name: /Consultar NC/ }))

    await waitFor(() => expect(consultarNcMock).toHaveBeenCalledWith(3))
    expect(await screen.findByText(/001-003-0000013: APROBADA/)).toBeInTheDocument()
  })

  it('deshabilita las descargas de una NC simulada o no aprobada', () => {
    render(
      <GestionFactura
        factura={factura({
          puede_cancelar: false,
          puede_nota_credito: false,
          notas_credito: [{
            id: 3,
            numero: '0000013',
            numero_completo: '001-003-0000013',
            cdc: '',
            estado: 'EMITIDA',
            total: 757500,
            motivo: '5',
            motivo_display: 'Ajuste de precio',
            detalle: '',
            creada: '2026-10-24T15:05:00Z',
            simulada: true,
          }],
        })}
        onActualizada={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', {
      name: 'Gestionar factura 001-003-0000100',
    }))
    expect(screen.getByRole('button', {
      name: 'Descargar KuDE NC 001-003-0000013',
    })).toBeDisabled()
    expect(screen.getByRole('button', {
      name: 'Descargar XML NC 001-003-0000013',
    })).toBeDisabled()
  })

  it('muestra el error del backend al intentar una acción', async () => {
    cancelarMock.mockRejectedValue(new Error('Ya pasó el plazo de cancelación.'))
    render(<GestionFactura factura={factura()} onActualizada={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', {
      name: 'Gestionar factura 001-003-0000100',
    }))
    fireEvent.click(screen.getByRole('button', { name: /Anular comprobante/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar anulación' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ya pasó el plazo de cancelación.',
    )
  })
})
