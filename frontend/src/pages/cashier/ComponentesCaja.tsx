/**
 * Piezas visuales compartidas por las pantallas de caja (PI-43/PI-44/PI-78):
 * la ventana modal con botones fijos, los campos de cantidad de billetes y
 * de monto, el detalle de una entrega y los formatos de fecha y billete.
 *
 * @module ComponentesCaja
 */
import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { formatearMonto, type Entrega, type MonedaCaja } from '@/services/cajas'

/** Fecha y hora corta, por ejemplo `09/10, 08:30`. */
export function fechaCorta(iso: string): string {
  return new Date(iso).toLocaleString('es-PY', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

/** Monto o billete con el símbolo de su moneda, por ejemplo `$ 100`. */
export function textoBillete(m: Pick<MonedaCaja, 'simbolo' | 'codigo' | 'decimales'>, valor: number): string {
  return `${m.simbolo || m.codigo} ${formatearMonto(valor, m.decimales)}`
}

/**
 * Igual que {@link textoBillete}, pero para la divisa de una solicitud de
 * reposición (PI-80).
 *
 * `SolicitudReposicion` llama `monedaCodigo` a lo que en el resto del
 * sistema es `codigo`; esta función puente evita repetir el objeto en
 * cada llamada.
 */
export function textoSolicitud(
  s: { monedaCodigo: string; simbolo: string; decimales: number },
  valor: number,
): string {
  return textoBillete(
    { codigo: s.monedaCodigo, simbolo: s.simbolo, decimales: s.decimales },
    valor,
  )
}

/**
 * Ventana modal con encabezado y botones fijos: solo se desplaza el
 * contenido del medio, así "Guardar" queda siempre a la vista. Mientras
 * está abierta, la página de fondo no scrollea (un solo scroll).
 */
export function Modal({
  titulo, onCerrar, onSubmit, pie, children,
}: {
  titulo: string
  onCerrar: () => void
  onSubmit: (e: React.FormEvent) => void
  pie: React.ReactNode
  children: React.ReactNode
}) {
  useEffect(() => {
    const anterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = anterior }
  }, [])

  // Portal a <body>: la página usa una animación con transform, y eso
  // hace que `fixed` se ubique respecto de la página y no de la ventana.
  return createPortal(
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex justify-center items-center z-50 p-4">
      <form
        role="dialog"
        aria-label={titulo}
        onSubmit={onSubmit}
        className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden text-xs"
      >
        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-200 shrink-0">
          <h3 className="font-bold text-slate-900 text-sm">{titulo}</h3>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="text-slate-400 hover:text-slate-600 text-sm">✕</button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4">
          {children}
        </div>
        <div className="shrink-0 border-t border-slate-200 bg-slate-50 px-6 py-4 space-y-3">
          {pie}
        </div>
      </form>
    </div>,
    document.body,
  )
}

export function BotonesModal({ onCerrar, textoConfirmar, deshabilitado, textoCerrar = 'Cancelar' }: {
  onCerrar: () => void
  textoConfirmar: string
  deshabilitado: boolean
  textoCerrar?: string
}) {
  return (
    <div className="flex gap-2">
      <button type="button" onClick={onCerrar} className="flex-1 py-2.5 border border-slate-300 rounded-lg bg-white text-slate-600 font-semibold">{textoCerrar}</button>
      <button type="submit" disabled={deshabilitado} className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg disabled:opacity-50">
        {textoConfirmar}
      </button>
    </div>
  )
}

/** Campo numérico de cantidad de billetes (enteros, sin negativos). */
export function CampoCantidad({ id, valor, onCambio, error = false, mostrarCero = false }: {
  id: string
  valor: number
  onCambio: (n: number) => void
  error?: boolean
  mostrarCero?: boolean
}) {
  return (
    <input
      id={id}
      type="number"
      min="0"
      step="1"
      inputMode="numeric"
      value={mostrarCero ? valor : valor || ''}
      placeholder="0"
      onChange={e => onCambio(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
      onFocus={e => e.target.select()}
      className={`w-20 px-2 py-1.5 border rounded-lg text-right font-mono font-semibold bg-white ${error ? 'border-rose-400' : 'border-slate-200'}`}
    />
  )
}

/**
 * Valida el texto de un monto: positivo (o cero si se permite) y con no
 * más decimales que los de la moneda. Devuelve el número o un mensaje.
 */
export function leerMonto(
  texto: string, decimales: number, permitirCero = false,
): { monto: number } | { error: string } {
  const limpio = texto.trim()
  if (!limpio) return { error: 'Ingresá un monto.' }
  const monto = Number(limpio)
  if (!Number.isFinite(monto)) return { error: 'Monto inválido.' }
  if (monto < 0 || (!permitirCero && monto === 0)) {
    return { error: permitirCero ? 'El monto no puede ser negativo.' : 'El monto debe ser mayor a cero.' }
  }
  const parteDecimal = limpio.split('.')[1] ?? ''
  if (parteDecimal.replace(/0+$/, '').length > decimales) {
    return { error: decimales === 0 ? 'Esta moneda no admite decimales.' : `Máximo ${decimales} decimales.` }
  }
  return { monto }
}

/** Campo de monto de dinero, con los decimales que admite la moneda. */
export function CampoMonto({ id, valor, onCambio, decimales, error = false, ancho = 'w-full' }: {
  id: string
  valor: string
  onCambio: (texto: string) => void
  decimales: number
  error?: boolean
  ancho?: string
}) {
  return (
    <input
      id={id}
      type="number"
      min="0"
      step={decimales === 0 ? '1' : String(10 ** -decimales)}
      inputMode={decimales === 0 ? 'numeric' : 'decimal'}
      value={valor}
      placeholder="0"
      onChange={e => onCambio(e.target.value)}
      onFocus={e => e.target.select()}
      className={`${ancho} px-3 py-2 border rounded-lg text-right font-mono font-semibold bg-white ${error ? 'border-rose-400' : 'border-slate-200'}`}
    />
  )
}

/** Billetes de una entrega agrupados por divisa, con el total de cada una. */
export function TablaEntrega({ entrega }: { entrega: Entrega }) {
  return (
    <div className="space-y-3">
      {entrega.totales.map(t => (
        <div key={t.monedaCodigo} className="border border-slate-200 rounded-lg">
          <div className="divide-y divide-slate-100">
            {entrega.detalle.filter(d => d.monedaCodigo === t.monedaCodigo).map(d => (
              <div key={d.denominacion} className="flex justify-between px-3 py-1.5">
                <span className="font-semibold">Billete {textoBillete({ ...t, codigo: t.monedaCodigo }, d.valor)}</span>
                <span className="font-mono text-slate-600">{d.cantidad} × {formatearMonto(d.valor, t.decimales)} = {formatearMonto(d.subtotal, t.decimales)}</span>
              </div>
            ))}
          </div>
          <div className="flex justify-between px-3 py-2 border-t border-slate-200 bg-slate-50 font-bold">
            <span>Total {t.monedaCodigo} ({t.cantidadBilletes} billetes)</span>
            <span className="font-mono text-emerald-700">{t.simbolo || t.monedaCodigo} {formatearMonto(t.total, t.decimales)}</span>
          </div>
        </div>
      ))}
    </div>
  )
}
