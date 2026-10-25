/**
 * Pruebas de `descargarDocumentoOficial` (PI-86): KuDE y XML de Factura
 * Segura a través del backend. Sin red: `fetch` está simulado.
 *
 * @module facturasOficiales.test
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  descargarDocumentoOficial,
  type FacturaElectronicaCompleta,
} from '@/services/facturasDescarga'

const base: FacturaElectronicaCompleta = {
  id: 7, operacion: 41, cliente_nombre: 'X', simulada: false,
  numero: '0000100', numero_completo: '001-003-0000100', cdc: '0'.repeat(44),
  estado: 'APROBADA', total: 1, email_destino: '', detalle: '',
  envio_fecha: null, envio_destinatario: '', envio_resultado: '',
  creada: '', estado_consultado: null, emitida_por_nombre: '',
}

describe('descargarDocumentoOficial', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('pide el KuDE al backend y lo guarda con el número de la factura', async () => {
    const fetchMock = vi.fn(async (_url: string) => new Response(new Blob(['%PDF']), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const crear = vi.fn(() => 'blob:x')
    vi.stubGlobal('URL', { ...URL, createObjectURL: crear, revokeObjectURL: vi.fn() })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    await descargarDocumentoOficial(base, 'kude')

    expect(String(fetchMock.mock.calls[0][0])).toContain('/facturas/7/kude/')
    expect(crear).toHaveBeenCalledTimes(1)
    expect(click).toHaveBeenCalledTimes(1)
    click.mockRestore()
  })

  it('rechaza simuladas y no aprobadas sin llamar a la API', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(descargarDocumentoOficial({ ...base, simulada: true })).rejects.toThrow(/simulada/)
    await expect(descargarDocumentoOficial({ ...base, estado: 'EMITIDA' })).rejects.toThrow(/aprobadas/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('muestra el mensaje del backend si Factura Segura falla', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ detail: 'CDC inexistente' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } })))
    await expect(descargarDocumentoOficial(base, 'xml')).rejects.toThrow('CDC inexistente')
  })
})
