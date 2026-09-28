/**
 * Pruebas unitarias del servicio de historial (PI-65, RF34/RF35).
 *
 * Se simula `apiFetch` para verificar los filtros que se envían al backend,
 * y se prueban las funciones puras de validación y exportación a CSV.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/services/api', () => ({ apiFetch: vi.fn() }))

import { apiFetch } from '@/services/api'
import {
  campoCsv,
  COLUMNAS_CSV,
  ESTADOS,
  historialACsv,
  listarHistorial,
  nombreArchivoHistorial,
  validarRangoFechas,
} from '@/services/historial'
import type { Operacion } from '@/services/operaciones'

const apiFetchMock = vi.mocked(apiFetch)

function operacion(extra: Partial<Operacion> = {}): Operacion {
  return {
    id: 7,
    cliente: 1,
    cliente_nombre: 'Cliente Prueba',
    usuario_keycloak_id: 'sub-1',
    usuario_nombre: 'enrique',
    tipo_operacion: 'COMPRA',
    moneda_origen: 1,
    moneda_origen_codigo: 'PYG',
    moneda_destino: 2,
    moneda_destino_codigo: 'USD',
    monto_enviado: 750000,
    monto_recibido: 100,
    cotizacion_aplicada: 7500,
    tasa_origen: null,
    tasa_destino: 7500,
    metodo_pago: 'transfer',
    billetera_destino: null,
    billetera_destino_detalle: '',
    cuenta_origen: null,
    cuenta_origen_detalle: '',
    billetera_origen: null,
    billetera_origen_detalle: '',
    fecha_creacion: '2026-09-25T20:00:00Z',
    estado: 'PAGADA',
    fecha_cotizacion: '2026-09-25T20:00:00Z',
    fecha_confirmacion: '2026-09-25T20:00:10Z',
    fecha_cancelacion: null,
    cancelada_por: '',
    cancelada_por_nombre: '',
    motivo_cancelacion: '',
    tolerancia_segundos: 30,
    segundos_restantes: 0,
    ...extra,
  }
}

/** Separa el CSV en filas y columnas (sin BOM ni la última línea vacía). */
function parsear(csv: string): string[][] {
  return csv.replace(/^\uFEFF/, '').trimEnd().split('\r\n').map(l => l.split(';'))
}

beforeEach(() => {
  apiFetchMock.mockReset()
  apiFetchMock.mockResolvedValue([])
})

describe('listarHistorial (RF35)', () => {
  it('sin filtros pide solo las operaciones propias', async () => {
    await listarHistorial()
    expect(apiFetchMock).toHaveBeenCalledWith('/operaciones/?mine=1')
  })

  it('envía los cuatro filtros al backend', async () => {
    await listarHistorial({
      desde: '2026-09-01',
      hasta: '2026-09-30',
      tipo: 'VENTA',
      moneda: 'USD',
      estado: 'ANULADA',
    })
    const url = String(apiFetchMock.mock.calls[0][0])
    const qs = new URLSearchParams(url.split('?')[1])
    expect(qs.get('mine')).toBe('1')
    expect(qs.get('desde')).toBe('2026-09-01')
    expect(qs.get('hasta')).toBe('2026-09-30')
    expect(qs.get('tipo')).toBe('VENTA')
    expect(qs.get('moneda')).toBe('USD')
    expect(qs.get('estado')).toBe('ANULADA')
  })

  it('el admin pide todas las operaciones (sin mine)', async () => {
    await listarHistorial({ todos: true })
    expect(apiFetchMock).toHaveBeenCalledWith('/operaciones/')
  })

  it('filtra por el cliente activo', async () => {
    await listarHistorial({ clienteId: 3 })
    expect(apiFetchMock).toHaveBeenCalledWith('/operaciones/?mine=1&cliente=3')
  })

  it('no envía filtros vacíos', async () => {
    await listarHistorial({ desde: '', moneda: '', estado: undefined })
    expect(apiFetchMock).toHaveBeenCalledWith('/operaciones/?mine=1')
  })

  it('rechaza un rango de fechas invertido sin llamar al backend', async () => {
    await expect(listarHistorial({ desde: '2026-09-30', hasta: '2026-09-01' })).rejects.toThrow(/posterior/)
    expect(apiFetchMock).not.toHaveBeenCalled()
  })

  it('devuelve las operaciones mapeadas', async () => {
    apiFetchMock.mockResolvedValue([{ id: 3, estado: 'CANCELADA', monto_enviado: '10.50' }])
    const ops = await listarHistorial()
    expect(ops[0].id).toBe(3)
    expect(ops[0].estado).toBe('CANCELADA')
    expect(ops[0].monto_enviado).toBe(10.5)
  })
})

describe('estados del filtro', () => {
  it('incluye los cuatro estados del diagrama', () => {
    expect(ESTADOS).toEqual(['PENDIENTE', 'PAGADA', 'CANCELADA', 'ANULADA'])
  })
})

describe('validarRangoFechas', () => {
  it.each([
    [undefined, undefined],
    ['2026-09-01', undefined],
    [undefined, '2026-09-30'],
    ['2026-09-01', '2026-09-30'],
    ['2026-09-15', '2026-09-15'],
  ])('acepta desde=%s hasta=%s', (desde, hasta) => {
    expect(validarRangoFechas(desde, hasta)).toBeNull()
  })

  it('rechaza desde posterior a hasta', () => {
    expect(validarRangoFechas('2026-10-01', '2026-09-30')).toMatch(/posterior/)
  })
})

describe('historialACsv (RF34)', () => {
  it('empieza con BOM para que Excel respete los acentos', () => {
    expect(historialACsv([]).startsWith('\uFEFF')).toBe(true)
  })

  it('tiene encabezado aunque no haya operaciones', () => {
    expect(parsear(historialACsv([]))).toEqual([COLUMNAS_CSV])
  })

  it('no expone la comisión al cliente', () => {
    expect(COLUMNAS_CSV.some(c => c.toLowerCase().includes('comisi'))).toBe(false)
  })

  it('una fila por operación con el mismo número de columnas', () => {
    const filas = parsear(historialACsv([operacion({ id: 1 }), operacion({ id: 2 })]))
    expect(filas).toHaveLength(3)
    filas.forEach(f => expect(f).toHaveLength(COLUMNAS_CSV.length))
    expect(filas[1][0]).toBe('1')
    expect(filas[2][0]).toBe('2')
  })

  it('usa etiquetas legibles y coma decimal', () => {
    const [, fila] = parsear(historialACsv([operacion()]))
    const col = (nombre: string) => fila[COLUMNAS_CSV.indexOf(nombre)]
    expect(col('Realizada por')).toBe('enrique')
    expect(col('Tipo')).toBe('Compra')
    expect(col('Estado')).toBe('Pagada')
    expect(col('Monto enviado')).toBe('750000')
    expect(col('Monto recibido')).toBe('100,00')
    expect(col('Tipo efectivo')).toBe('7500,000000')
  })

  const cancelada = () => operacion({
    estado: 'CANCELADA',
    fecha_confirmacion: null,
    fecha_cancelacion: '2026-09-25T20:01:00Z',
    cancelada_por_nombre: 'ana',
    motivo_cancelacion: 'COTIZACION_CAMBIADA',
  })

  it('incluye quién, cuándo y por qué se canceló (auditoría)', () => {
    const [, fila] = parsear(historialACsv([cancelada()]))
    const col = (nombre: string) => fila[COLUMNAS_CSV.indexOf(nombre)]
    expect(col('Estado')).toBe('Cancelada')
    expect(col('Cancelada por')).toBe('ana')
    expect(col('Motivo de cancelación')).toBe('No aceptó la nueva cotización')
    expect(col('Fecha de cancelación')).toMatch(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/)
    expect(col('Fecha de pago')).toBe('')
  })

  it('escapa nombres con punto y coma o comillas', () => {
    const csv = historialACsv([operacion({ cliente_nombre: 'Pérez; "Hnos" S.A.' })])
    expect(csv).toContain('"Pérez; ""Hnos"" S.A."')
  })
})

describe('campoCsv', () => {
  it('deja igual un texto simple', () => {
    expect(campoCsv('Compra')).toBe('Compra')
  })
  it('encierra entre comillas si hay salto de línea', () => {
    expect(campoCsv('a\nb')).toBe('"a\nb"')
  })
})

describe('nombreArchivoHistorial', () => {
  const hoy = new Date(2026, 8, 25)

  it('sin filtros de fecha', () => {
    expect(nombreArchivoHistorial({}, hoy)).toBe('historial-transacciones_2026-09-25.csv')
  })

  it('con rango de fechas', () => {
    expect(nombreArchivoHistorial({ desde: '2026-09-01', hasta: '2026-09-20' }, hoy))
      .toBe('historial-transacciones_desde-2026-09-01_hasta-2026-09-20_2026-09-25.csv')
  })
})