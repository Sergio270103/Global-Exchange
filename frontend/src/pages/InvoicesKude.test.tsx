/**
 * Pruebas del KuDE y el XML oficiales en la pantalla de facturas (PI-86).
 *
 * Factura real aprobada: el PDF baja el KuDE de Factura Segura y aparece
 * el botón XML. Simulada: sigue el PDF propio y no hay XML. La API está
 * simulada con `fetch`: no se llama a Factura Segura.
 *
 * @module InvoicesKude.test
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import Invoices from '@/pages/Invoices'

vi.mock('@/services/facturasDescarga', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/facturasDescarga')>()
  return { ...actual, descargarFacturaPdf: vi.fn(), guardarArchivo: vi.fn() }
})

import { descargarFacturaPdf } from '@/services/facturasDescarga'

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json' },
  })
}

const operacion = {
  id: 41, cliente: 1, cliente_nombre: 'Ministerio de Salud',
  usuario_keycloak_id: 'sub', usuario_nombre: 'Johana', tipo_operacion: 'COMPRA',
  moneda_origen: 1, moneda_origen_codigo: 'PYG', moneda_destino: 2,
  moneda_destino_codigo: 'USD', monto_enviado: 4030000, monto_recibido: 500,
  cotizacion_aplicada: 8000, tasa_origen: null, tasa_destino: 8000,
  metodo_pago: 'transfer', billetera_destino: null, billetera_destino_detalle: '',
  cuenta_origen: null, cuenta_origen_detalle: '', billetera_origen: null,
  billetera_origen_detalle: '', fecha_creacion: '2026-10-24T20:29:00Z',
  estado: 'PAGADA', fecha_cotizacion: '2026-10-24T20:29:00Z',
  fecha_confirmacion: null, fecha_cancelacion: null, cancelada_por: '',
  cancelada_por_nombre: '', motivo_cancelacion: '', tolerancia_segundos: 30,
  segundos_restantes: 0,
}

function factura(simulada: boolean) {
  return {
    id: 7, operacion: 41, cliente_nombre: 'Ministerio de Salud', simulada,
    numero: '0000100', numero_completo: '001-003-0000100', cdc: '0'.repeat(44),
    estado: 'APROBADA', total: 4030000, email_destino: 'yo@test.com',
    detalle: '0260 - Aprobado', respuesta_servicio: {}, envio_fecha: null,
    envio_destinatario: '', envio_resultado: '', emitida_por_nombre: 'Johana',
    creada: '2026-10-24T20:29:00Z', actualizada: '2026-10-24T20:29:00Z',
    estado_consultado: null,
  }
}

function mockApi(simulada: boolean) {
  const fetchMock = vi.fn(async (url: string) => {
    const u = String(url)
    if (u.includes('/facturas/7/kude/')) return new Response(new Blob(['%PDF-1.4']), { status: 200 })
    if (u.includes('/facturas/7/xml/')) return new Response(new Blob(['<rDE/>']), { status: 200 })
    if (u.includes('/facturas/')) return json([factura(simulada)])
    if (u.includes('/operaciones/')) return json([operacion])
    return json([])
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('Invoices: KuDE y XML oficiales (PI-86)', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.unstubAllGlobals())

  it('factura real: el PDF baja el KuDE de Factura Segura y hay XML', async () => {
    const fetchMock = mockApi(false)
    render(<Invoices />)
    fireEvent.click(await screen.findByRole('button', { name: 'Descargar factura 001-003-0000100' }))
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([u]) => String(u).includes('/facturas/7/kude/'))).toBe(true))
    expect(descargarFacturaPdf).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Descargar XML 001-003-0000100' }))
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([u]) => String(u).includes('/facturas/7/xml/'))).toBe(true))
  })

  it('factura simulada: PDF propio y sin botón XML', async () => {
    const fetchMock = mockApi(true)
    render(<Invoices />)
    fireEvent.click(await screen.findByRole('button', { name: 'Descargar factura 001-003-0000100' }))
    expect(descargarFacturaPdf).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('/kude/'))).toBe(false)
    expect(screen.queryByRole('button', { name: /Descargar XML/ })).not.toBeInTheDocument()
  })
})
