/**
 * Pruebas del servicio de descargas de facturas (PI-86).
 *
 * Se simula `apiFetch` para verificar el mapeo del endpoint de PI-30 y
 * `jsPDF` para comprobar el nombre del archivo descargado. La elección de
 * la factura vigente, el CSV y las líneas del PDF se prueban sin
 * navegador.
 *
 * @module services/facturasDescarga.test
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { saveMock } = vi.hoisted(() => ({ saveMock: vi.fn() }))

vi.mock('@/services/api', () => ({ apiFetch: vi.fn() }))
vi.mock('jspdf', () => ({
  jsPDF: class {
    setFont = vi.fn()
    setFontSize = vi.fn()
    splitTextToSize = vi.fn((texto: string) => [texto])
    text = vi.fn()
    addPage = vi.fn()
    save = saveMock
  },
}))

import { apiFetch } from '@/services/api'
import {
  COLUMNAS_CSV,
  descargarFacturaPdf,
  elegirFactura,
  facturasACsv,
  lineasFacturaPdf,
  listarFacturasElectronicas,
  motivoPdf,
  nombreArchivoFactura,
  nombreArchivoFacturas,
  type FacturaElectronicaCompleta,
} from '@/services/facturasDescarga'
import type { EstadoFactura } from '@/services/facturas'
import type { Operacion } from '@/services/operaciones'

const apiFetchMock = vi.mocked(apiFetch)

const operacion: Operacion = {
  id: 12,
  cliente: 7,
  cliente_nombre: 'enrique acosta',
  usuario_keycloak_id: 'sub-1',
  usuario_nombre: 'enrique',
  tipo_operacion: 'COMPRA',
  moneda_origen: 1,
  moneda_origen_codigo: 'PYG',
  moneda_destino: 2,
  moneda_destino_codigo: 'USD',
  monto_enviado: 757513,
  monto_recibido: 98.66,
  cotizacion_aplicada: 7602,
  tasa_origen: null,
  tasa_destino: 7602,
  metodo_pago: 'efectivo',
  billetera_destino: null,
  billetera_destino_detalle: '',
  cuenta_origen: null,
  cuenta_origen_detalle: '',
  billetera_origen: null,
  billetera_origen_detalle: '',
  fecha_creacion: '2026-10-11T15:06:05Z',
  estado: 'PAGADA',
  fecha_cotizacion: '2026-10-11T15:06:05Z',
  fecha_confirmacion: '2026-10-11T15:06:05Z',
  fecha_cancelacion: null,
  cancelada_por: '',
  cancelada_por_nombre: '',
  motivo_cancelacion: '',
  tolerancia_segundos: 300,
  segundos_restantes: 300,
}

function fe(
  estado: EstadoFactura,
  extra: Partial<FacturaElectronicaCompleta> = {},
): FacturaElectronicaCompleta {
  return {
    id: 1,
    operacion: 12,
    cliente_nombre: 'enrique acosta',
    simulada: true,
    numero: '0000100',
    numero_completo: '001-003-0000100',
    cdc: '0180069560101101199369560110100000100000100000101a1b2c3d',
    estado,
    total: 757513,
    email_destino: 'enrique@test.com',
    detalle: '',
    envio_fecha: '2026-10-11T15:10:00Z',
    envio_destinatario: 'enrique@test.com',
    envio_resultado: 'Enviado por Factura Segura',
    creada: '2026-10-11T15:08:00Z',
    estado_consultado: '2026-10-11T15:09:00Z',
    emitida_por_nombre: 'Cajero Prueba',
    ...extra,
  }
}

describe('servicio de descargas de facturas', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('lista las facturas electrónicas del endpoint de PI-30', async () => {
    apiFetchMock.mockResolvedValue([{
      id: '1',
      operacion: '12',
      cliente_nombre: 'enrique acosta',
      simulada: true,
      numero: '0000100',
      numero_completo: '001-003-0000100',
      cdc: '0180...',
      estado: 'APROBADA',
      total: '757513',
      email_destino: 'enrique@test.com',
      detalle: '',
      envio_fecha: null,
      envio_destinatario: '',
      envio_resultado: '',
      creada: '2026-10-11T15:08:00Z',
      estado_consultado: null,
      emitida_por_nombre: 'Cajero Prueba',
    }] as never)

    const facturas = await listarFacturasElectronicas()

    expect(apiFetchMock).toHaveBeenCalledWith('/facturas/')
    expect(facturas).toHaveLength(1)
    expect(facturas[0].total).toBe(757513)
    expect(facturas[0].operacion).toBe(12)
    expect(facturas[0].envio_fecha).toBeNull()
    expect(facturas[0].emitida_por_nombre).toBe('Cajero Prueba')
  })

  it('elige la factura vigente: aprobada antes que rechazada', () => {
    const rechazada = fe('RECHAZADA', { id: 1, detalle: 'RUC inválido' })
    const aprobada = fe('APROBADA', { id: 2 })

    expect(elegirFactura([rechazada, aprobada], 12)?.id).toBe(2)
    expect(elegirFactura([rechazada, aprobada], 99)).toBeNull()

    const emitida = fe('EMITIDA', { id: 3 })
    const error = fe('ERROR', { id: 4 })
    expect(elegirFactura([error, emitida], 12)?.id).toBe(3)

    const verificar = fe('VERIFICAR', { id: 5 })
    expect(elegirFactura([verificar, rechazada], 12)?.id).toBe(5)
  })

  it('describe el motivo del botón según el estado de la factura', () => {
    expect(motivoPdf(null)).toContain('Todavía no se emitió')
    expect(motivoPdf(fe('APROBADA'))).toBe('Descargar factura 001-003-0000100')
    expect(motivoPdf(fe('RECHAZADA'))).toBe('SIFEN rechazó la factura.')
    expect(motivoPdf(fe('RECHAZADA', { detalle: 'RUC inválido' })))
      .toBe('SIFEN rechazó la factura: RUC inválido')
    expect(motivoPdf(fe('EMITIDA'))).toContain('no está aprobada por SIFEN')
    expect(motivoPdf(fe('VERIFICAR'))).toContain('no está aprobada por SIFEN')
    expect(motivoPdf(fe('ERROR', { detalle: 'sin configuración' })))
      .toBe('No se generó la factura: sin configuración')
  })

  it('usa el número del servicio como nombre del PDF', () => {
    expect(nombreArchivoFactura(fe('APROBADA'))).toBe('001-003-0000100.pdf')
    expect(nombreArchivoFactura(fe('APROBADA', { numero_completo: '001/003 0100' })))
      .toBe('001-003-0100.pdf')
    expect(nombreArchivoFactura(fe('APROBADA', { numero_completo: '', cdc: '0180ABC' })))
      .toBe('0180ABC.pdf')
  })

  it('incluye en el PDF el número, el CDC y los datos del envío', () => {
    const texto = lineasFacturaPdf(fe('APROBADA'), operacion).join('\n')

    expect(texto).toContain('FACTURA ELECTRONICA')
    expect(texto).toContain('001-003-0000100')
    expect(texto).toContain('0180069560101101199369560110100000100000100000101a1b2c3d')
    expect(texto).toContain('enrique acosta')
    expect(texto).toContain('OP-12')
    expect(texto).toContain('enrique@test.com')
    expect(texto).toContain('Enviado por Factura Segura')
    expect(texto).toContain('TOTAL FACTURADO: 757.513 PYG')
    expect(texto).toContain('Emision: simulada')
  })

  it('descarga el PDF de una factura aprobada por SIFEN', () => {
    descargarFacturaPdf(fe('APROBADA'), operacion)

    expect(saveMock).toHaveBeenCalledWith('001-003-0000100.pdf')
  })

  it('no genera PDF para facturas no aprobadas', () => {
    expect(() => descargarFacturaPdf(fe('RECHAZADA'), operacion)).toThrow(/aprobadas/i)
    expect(() => descargarFacturaPdf(fe('EMITIDA'), operacion)).toThrow(/aprobadas/i)
    expect(() => descargarFacturaPdf(fe('VERIFICAR'), operacion)).toThrow(/aprobadas/i)
    expect(() => descargarFacturaPdf(fe('ERROR'), operacion)).toThrow(/aprobadas/i)

    expect(saveMock).not.toHaveBeenCalled()
  })

  it('genera un CSV con BOM, encabezados y escape de campos', () => {
    const csv = facturasACsv([
      {
        operacion,
        estado: 'Aprobada',
        motivo: '',
        factura: fe('APROBADA'),
      },
      {
        operacion: { ...operacion, id: 8, cliente_nombre: 'Martínez; S.A.', estado: 'CANCELADA' },
        estado: 'Rechazada',
        motivo: 'Desistió',
        factura: null,
      },
    ])

    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(csv).toContain(COLUMNAS_CSV.join(';'))
    expect(csv).toContain('001-003-0000100')
    expect(csv).toContain('0180069560101101199369560110100000100000100000101a1b2c3d')
    expect(csv).toContain('Aprobada')
    expect(csv).toContain('"Martínez; S.A."')
    expect(csv).toContain('Sin factura electrónica')
    expect(csv).toContain('757513')
    expect(csv).toContain('Enviado por Factura Segura')
  })

  it('arma el nombre del CSV con los filtros aplicados', () => {
    expect(
      nombreArchivoFacturas(
        { estado: 'Aprobada', desde: '2026-10-01', hasta: '2026-10-31' },
        new Date(2026, 9, 24),
      ),
    ).toBe('facturas_estado-Aprobada_desde-2026-10-01_hasta-2026-10-31_2026-10-24.csv')

    expect(
      nombreArchivoFacturas(
        { estado: 'TODAS', desde: '', hasta: '' },
        new Date(2026, 9, 24),
      ),
    ).toBe('facturas_2026-10-24.csv')
  })
})
