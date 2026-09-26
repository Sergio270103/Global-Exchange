/**
 * Pruebas unitarias del servicio de operaciones para PI-64
 * (cancelación de transacción por cambio de cotización).
 *
 * Se simula `apiFetch` para verificar qué se envía al backend y cómo se
 * interpretan sus respuestas, sin necesidad de levantar Django.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/services/api', () => ({ apiFetch: vi.fn() }))

import { apiFetch } from '@/services/api'
import {
  cancelarOperacion,
  confirmarOperacion,
  listarOperaciones,
} from '@/services/operaciones'

const apiFetchMock = vi.mocked(apiFetch)

/** Operación como la devuelve Django (los decimales llegan como string). */
function operacionApi(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 7,
    cliente: 1,
    cliente_nombre: 'Cliente Prueba',
    usuario_keycloak_id: 'sub-1',
    tipo_operacion: 'COMPRA',
    moneda_origen: 1,
    moneda_origen_codigo: 'PYG',
    moneda_destino: 2,
    moneda_destino_codigo: 'USD',
    monto_enviado: '750000.00',
    monto_recibido: '100.00',
    cotizacion_aplicada: '7500.000000',
    tasa_origen: null,
    tasa_destino: '7500.00',
    porcentaje_comision_aplicado: '0.00',
    monto_comision: '0.00',
    metodo_pago: 'transfer',
    fecha_creacion: '2026-09-25T20:00:00Z',
    estado: 'PENDIENTE',
    fecha_cotizacion: '2026-09-25T20:00:00Z',
    fecha_confirmacion: null,
    fecha_cancelacion: null,
    cancelada_por: '',
    cancelada_por_nombre: '',
    motivo_cancelacion: '',
    tolerancia_segundos: 30,
    segundos_restantes: 30,
    ...extra,
  }
}

beforeEach(() => {
  apiFetchMock.mockReset()
})

describe('confirmarOperacion', () => {
  it('llama al endpoint confirmar con POST', async () => {
    apiFetchMock.mockResolvedValue({
      resultado: 'CONFIRMADA',
      operacion: operacionApi({ estado: 'PAGADA' }),
    })

    await confirmarOperacion(7)

    expect(apiFetchMock).toHaveBeenCalledWith(
      '/operaciones/7/confirmar/',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('devuelve la operación pagada cuando se confirma', async () => {
    apiFetchMock.mockResolvedValue({
      resultado: 'CONFIRMADA',
      operacion: operacionApi({ estado: 'PAGADA', fecha_confirmacion: '2026-09-25T20:00:10Z' }),
    })

    const r = await confirmarOperacion(7)

    expect(r.resultado).toBe('CONFIRMADA')
    expect(r.operacion.estado).toBe('PAGADA')
    expect(r.operacion.monto_enviado).toBe(750000)
  })

  it('devuelve la cotización anterior y la nueva cuando la tasa cambió', async () => {
    apiFetchMock.mockResolvedValue({
      resultado: 'COTIZACION_CAMBIADA',
      detail: 'La cotización cambió. Revisá la nueva antes de continuar.',
      anterior: operacionApi(),
      operacion: operacionApi({ monto_enviado: '770000.00', cotizacion_aplicada: '7700.000000' }),
    })

    const r = await confirmarOperacion(7)

    expect(r.resultado).toBe('COTIZACION_CAMBIADA')
    if (r.resultado !== 'COTIZACION_CAMBIADA') return
    expect(r.anterior.monto_enviado).toBe(750000)
    expect(r.operacion.monto_enviado).toBe(770000)
    expect(r.operacion.estado).toBe('PENDIENTE')
  })
})

describe('cancelarOperacion', () => {
  it('envía el motivo de cancelación', async () => {
    apiFetchMock.mockResolvedValue(operacionApi({ estado: 'CANCELADA' }))

    await cancelarOperacion(7, 'COTIZACION_CAMBIADA')

    const [ruta, init] = apiFetchMock.mock.calls[0]
    expect(ruta).toBe('/operaciones/7/cancelar/')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual({ motivo: 'COTIZACION_CAMBIADA' })
  })

  it('usa DESISTIO como motivo por defecto', async () => {
    apiFetchMock.mockResolvedValue(operacionApi({ estado: 'CANCELADA' }))

    await cancelarOperacion(7)

    const [, init] = apiFetchMock.mock.calls[0]
    expect(JSON.parse(String(init?.body))).toEqual({ motivo: 'DESISTIO' })
  })

  it('mapea los datos de auditoría de la cancelación', async () => {
    apiFetchMock.mockResolvedValue(operacionApi({
      estado: 'CANCELADA',
      fecha_cancelacion: '2026-09-25T20:01:00Z',
      cancelada_por: 'sub-1',
      cancelada_por_nombre: 'cliente.prueba',
      motivo_cancelacion: 'COTIZACION_CAMBIADA',
      segundos_restantes: 0,
    }))

    const op = await cancelarOperacion(7, 'COTIZACION_CAMBIADA')

    expect(op.estado).toBe('CANCELADA')
    expect(op.cancelada_por_nombre).toBe('cliente.prueba')
    expect(op.fecha_cancelacion).toBe('2026-09-25T20:01:00Z')
    expect(op.motivo_cancelacion).toBe('COTIZACION_CAMBIADA')
  })
})

describe('listarOperaciones', () => {
  it('filtra por estado en el historial', async () => {
    apiFetchMock.mockResolvedValue([operacionApi({ estado: 'CANCELADA' })])

    const lista = await listarOperaciones({ mine: true, estado: 'CANCELADA' })

    expect(apiFetchMock).toHaveBeenCalledWith('/operaciones/?mine=1&estado=CANCELADA')
    expect(lista[0].estado).toBe('CANCELADA')
  })
})