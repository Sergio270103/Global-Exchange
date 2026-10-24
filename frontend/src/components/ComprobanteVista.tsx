/**
 * Vista imprimible del comprobante interno (PI-42, RF63).
 *
 * Muestra el recibo con los datos del cliente y la operación más el
 * número único, con botones para imprimir (`window.print`, solo sale
 * el comprobante gracias al CSS de impresión) y descargar en PDF.
 *
 * Un solo scroll: el contenido se desplaza dentro de la ventana, los
 * botones quedan fijos abajo y la página de fondo no se mueve.
 *
 * @module ComprobanteVista
 */
import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { jsPDF } from 'jspdf'
import type { Comprobante } from '@/services/comprobantes'
import EmitirFactura from '@/components/EmitirFactura'

interface Props {
  comprobante: Comprobante
  onClose: () => void
}

function linea(doc: jsPDF, texto: string, y: number, negrita = false): number {
  doc.setFont('courier', negrita ? 'bold' : 'normal')
  doc.text(texto, 20, y)
  return y + 7
}

function generarPdf(c: Comprobante): void {
  const doc = new jsPDF()
  let y = 25
  doc.setFontSize(14)
  y = linea(doc, 'GLOBAL EXCHANGE - COMPROBANTE INTERNO', y, true)
  doc.setFontSize(11)
  y = linea(doc, `Numero: ${c.numero}    Fecha: ${new Date(c.fecha_operacion).toLocaleString()}`, y + 3)
  y = linea(doc, '--------------------------------------------------------', y)
  y = linea(doc, `Cliente: ${c.cliente_nombre}`, y)
  y = linea(doc, `Documento: ${c.cliente_documento || '-'}`, y)
  y = linea(doc, `Operacion: ${c.tipo_operacion}`, y)
  y = linea(doc, `Entrega: ${c.monto_enviado.toLocaleString()} ${c.moneda_origen_codigo}`, y)
  y = linea(doc, `Recibe:  ${c.monto_recibido.toLocaleString()} ${c.moneda_destino_codigo}`, y)
  if (c.tasa_origen != null || c.tasa_destino != null) {
    y = linea(doc, `Tasas: ${c.tasa_origen ?? '-'} / ${c.tasa_destino ?? '-'}`, y)
  }
  if (c.monto_comision != null) {
    y = linea(doc, `Comision: ${c.monto_comision.toLocaleString()}`, y)
  }
  y = linea(doc, `Metodo: ${c.metodo_pago || '-'}`, y)
  y = linea(doc, `Atendido por: ${c.cajero_nombre || '-'}`, y)
  y = linea(doc, '--------------------------------------------------------', y)
  y = linea(doc, 'Comprobante interno, no es factura electronica.', y)
  doc.save(`${c.numero}.pdf`)
}

export default function ComprobanteVista({ comprobante: c, onClose }: Props) {
  // Mientras está abierta, la página de fondo no scrollea (un solo scroll).
  useEffect(() => {
    const anterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = anterior }
  }, [])

  // Portal a <body>: la página usa una animación con transform, y eso
  // hace que `fixed` se ubique respecto de la página y no de la ventana.
  return createPortal(
    <div className="fixed inset-0 bg-slate-900/60 flex justify-center items-center z-50 p-4">
      <div
        role="dialog"
        aria-label={`Comprobante ${c.numero}`}
        className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[92vh] flex flex-col overflow-hidden"
      >
        <div className="flex-1 min-h-0 overflow-y-auto p-6 pb-4">
          {/* Zona imprimible */}
          <div id="comprobante-print" className="border border-slate-200 rounded-lg p-5 font-mono text-sm text-slate-900">
            <h3 className="font-bold text-center text-base">GLOBAL EXCHANGE</h3>
            <p className="text-center text-xs text-slate-500">Comprobante interno de operación</p>
            <p className="text-center font-bold mt-1">{c.numero}</p>
            <p className="text-center text-xs">{new Date(c.fecha_operacion).toLocaleString()}</p>
            <hr className="my-3 border-dashed" />
            <dl className="space-y-1.5">
              <div className="flex justify-between gap-2"><dt className="text-slate-500">Cliente</dt><dd className="font-bold text-right">{c.cliente_nombre}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-slate-500">Documento</dt><dd className="text-right">{c.cliente_documento || '-'}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-slate-500">Operación</dt><dd className="text-right">{c.tipo_operacion}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-slate-500">Entrega</dt><dd className="text-right">{c.monto_enviado.toLocaleString()} {c.moneda_origen_codigo}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-slate-500">Recibe</dt><dd className="text-right">{c.monto_recibido.toLocaleString()} {c.moneda_destino_codigo}</dd></div>
              {(c.tasa_origen != null || c.tasa_destino != null) && (
                <div className="flex justify-between gap-2"><dt className="text-slate-500">Tasas</dt><dd className="text-right">{c.tasa_origen ?? '-'} / {c.tasa_destino ?? '-'}</dd></div>
              )}
              {c.monto_comision != null && (
                <div className="flex justify-between gap-2"><dt className="text-slate-500">Comisión</dt><dd className="text-right">{c.monto_comision.toLocaleString()}</dd></div>
              )}
              <div className="flex justify-between gap-2"><dt className="text-slate-500">Método</dt><dd className="text-right">{c.metodo_pago || '-'}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-slate-500">Atendido por</dt><dd className="text-right">{c.cajero_nombre || '-'}</dd></div>
            </dl>
            <hr className="my-3 border-dashed" />
            <p className="text-center text-[11px] text-slate-500">Comprobante interno, no es factura electrónica.</p>
          </div>
          {/* Factura electrónica (PI-30, no se imprime) */}
          {c.estado !== 'anulado' && <EmitirFactura operacionId={c.operacion} />}
        </div>
        {/* Acciones fijas (no se imprimen) */}
        <div className="shrink-0 flex gap-2 px-6 py-4 border-t border-slate-200 bg-slate-50 no-print">
          <button
            onClick={() => window.print()}
            className="flex-1 py-2 bg-slate-900 text-white rounded-lg font-semibold text-sm hover:bg-slate-800"
          >
            🖨️ Imprimir
          </button>
          <button
            onClick={() => generarPdf(c)}
            className="flex-1 py-2 bg-emerald-600 text-white rounded-lg font-semibold text-sm hover:bg-emerald-700"
          >
            📥 Descargar PDF
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-2 border rounded-lg text-slate-600 font-semibold text-sm"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
