/**
 * Control de caja del rol cajero (PI-44, ERS RF56/RF58).
 *
 * Muestra el saldo de billetes de la caja agrupado por divisa y
 * denominación, con el total por moneda. Permite registrar ingresos,
 * retiros (y entregas, solo admin) que actualizan el saldo al confirmar,
 * y registrar arqueos / cierres de turno como respaldo de auditoría.
 * El saldo se refresca solo cada 30 segundos.
 *
 * @module CashCountView
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { AuthUser } from '@/types'
import {
  formatearMonto,
  listarArqueos,
  listarCajas,
  listarMovimientos,
  obtenerSaldo,
  registrarArqueo,
  registrarMovimiento,
  type Arqueo,
  type Caja,
  type MovimientoCaja,
  type SaldoMoneda,
  type TipoMovimiento,
} from '@/services/cajas'

/** Propiedades de la vista de control de caja. */
export interface CashCountViewProps {
  /** Usuario autenticado; las entregas de billetes son solo para admin. */
  auth?: AuthUser
}

/** Cada cuánto se vuelve a consultar el saldo (ms). */
export const INTERVALO_REFRESCO_MS = 30_000

const ESTILO_TIPO: Record<TipoMovimiento, { signo: string; clase: string }> = {
  INGRESO: { signo: '+', clase: 'bg-emerald-50 text-emerald-700' },
  ENTREGA: { signo: '+', clase: 'bg-sky-50 text-sky-700' },
  RETIRO: { signo: '−', clase: 'bg-rose-50 text-rose-700' },
}

function fechaCorta(iso: string): string {
  return new Date(iso).toLocaleString('es-PY', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

function textoBillete(m: Pick<SaldoMoneda, 'simbolo' | 'codigo' | 'decimales'>, valor: number): string {
  return `${m.simbolo || m.codigo} ${formatearMonto(valor, m.decimales)}`
}

export default function CashCountView({ auth }: CashCountViewProps) {
  const esAdmin = auth?.role === 'admin'

  const [cajas, setCajas] = useState<Caja[]>([])
  const [cajaId, setCajaId] = useState<number | null>(null)
  const [saldo, setSaldo] = useState<SaldoMoneda[]>([])
  const [movimientos, setMovimientos] = useState<MovimientoCaja[]>([])
  const [arqueos, setArqueos] = useState<Arqueo[]>([])
  const [monedaSel, setMonedaSel] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [actualizado, setActualizado] = useState<Date | null>(null)
  const [modal, setModal] = useState<'movimiento' | 'arqueo' | null>(null)

  useEffect(() => {
    listarCajas()
      .then(lista => {
        setCajas(lista)
        setCajaId(lista[0]?.id ?? null)
        if (lista.length === 0) setCargando(false)
      })
      .catch((e: Error) => {
        setError(e.message)
        setCargando(false)
      })
  }, [])

  const recargar = useCallback(async (id: number) => {
    try {
      const [s, m, a] = await Promise.all([
        obtenerSaldo(id),
        listarMovimientos(id, { limite: 10 }),
        listarArqueos(id, 5),
      ])
      setSaldo(s)
      setMovimientos(m)
      setArqueos(a)
      setActualizado(new Date())
      setError('')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    if (cajaId === null) return
    setCargando(true)
    recargar(cajaId)
    const intervalo = setInterval(() => recargar(cajaId), INTERVALO_REFRESCO_MS)
    return () => clearInterval(intervalo)
  }, [cajaId, recargar])

  const monedaActiva = useMemo(
    () => saldo.find(m => m.codigo === monedaSel)
      ?? saldo.find(m => m.cantidadBilletes > 0)
      ?? saldo[0],
    [saldo, monedaSel],
  )
  const cajaActual = cajas.find(c => c.id === cajaId)

  const alRegistrarMovimiento = (mov: MovimientoCaja, nuevoSaldo: SaldoMoneda[]) => {
    setSaldo(nuevoSaldo)
    setMovimientos(prev => [mov, ...prev].slice(0, 10))
    setMonedaSel(mov.monedaCodigo)
    setActualizado(new Date())
    setModal(null)
    setAviso(`${mov.tipoDisplay} registrado. Saldo actualizado.`)
  }

  const alRegistrarArqueo = (arqueo: Arqueo) => {
    setArqueos(prev => [arqueo, ...prev].slice(0, 5))
    setModal(null)
    setAviso(arqueo.conDiferencias
      ? 'Arqueo registrado CON diferencias. Revisá el detalle.'
      : 'Arqueo registrado sin diferencias.')
  }

  if (!cargando && cajas.length === 0 && !error) {
    return (
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6 text-sm text-slate-500">
        No hay cajas habilitadas. Pedile a un administrador que registre una.
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fadein text-slate-800">
      {/* ENCABEZADO */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full uppercase tracking-wider">
            Gestión de Ventanilla
          </span>
          <h2 className="text-xl font-bold text-slate-900 mt-1" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
            Arqueo & Control de Caja
          </h2>
          <p className="text-xs text-slate-400">
            {actualizado ? `Saldo actualizado ${actualizado.toLocaleTimeString('es-PY')}` : 'Cargando saldo…'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {cajas.length > 1 ? (
            <select
              aria-label="Caja"
              value={cajaId ?? ''}
              onChange={e => { setMonedaSel(null); setCajaId(Number(e.target.value)) }}
              className="px-3 py-2 border rounded-lg text-xs font-semibold bg-white"
            >
              {cajas.map(c => <option key={c.id} value={c.id}>{c.sucursal} · {c.nombre}</option>)}
            </select>
          ) : cajaActual && (
            <span className="px-3 py-2 rounded-lg bg-slate-100 text-xs font-semibold">
              {cajaActual.sucursal} · {cajaActual.nombre}
            </span>
          )}
          <button
            onClick={() => cajaId !== null && recargar(cajaId)}
            className="px-3 py-2 border rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            ↻ Actualizar
          </button>
          <button
            onClick={() => { setAviso(''); setModal('arqueo') }}
            disabled={saldo.length === 0}
            className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            🧾 Registrar arqueo
          </button>
          <button
            onClick={() => { setAviso(''); setModal('movimiento') }}
            disabled={saldo.length === 0}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-lg shadow-sm disabled:opacity-50"
          >
            💵 Registrar movimiento
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="bg-rose-50 border border-rose-200 text-rose-700 rounded-lg p-3 text-xs">{error}</div>
      )}
      {aviso && (
        <div role="status" className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg p-3 text-xs">{aviso}</div>
      )}

      {/* TOTALES POR MONEDA */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {saldo.map(m => (
          <button
            key={m.codigo}
            onClick={() => setMonedaSel(m.codigo)}
            aria-pressed={monedaActiva?.codigo === m.codigo}
            className={`text-left p-3 rounded-xl border transition-all ${
              monedaActiva?.codigo === m.codigo
                ? 'border-emerald-400 bg-emerald-50/60 shadow-sm'
                : 'border-slate-100 bg-white hover:border-slate-300'
            }`}
          >
            <div className="text-xs font-bold text-slate-600">{m.flag} {m.codigo}</div>
            <div className="text-base font-bold font-mono text-slate-900 truncate" data-testid={`total-${m.codigo}`}>
              {m.simbolo || m.codigo} {formatearMonto(m.total, m.decimales)}
            </div>
            <div className="text-[10px] text-slate-400">{m.cantidadBilletes} billetes</div>
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* DETALLE POR DENOMINACIÓN */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-100 shadow-sm p-6 space-y-4">
          <h3 className="font-semibold text-sm text-slate-800 border-b pb-3">
            Billetes por denominación {monedaActiva && `· ${monedaActiva.nombre}`}
          </h3>
          {monedaActiva ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-400 border-b">
                  <th className="text-left font-semibold py-2">Denominación</th>
                  <th className="text-right font-semibold py-2">Cantidad</th>
                  <th className="text-right font-semibold py-2">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {monedaActiva.denominaciones.map(d => (
                  <tr key={d.denominacion} className={`border-b border-slate-50 ${d.cantidad === 0 ? 'text-slate-400' : ''}`}>
                    <td className="py-2 font-semibold">Billete {textoBillete(monedaActiva, d.valor)}</td>
                    <td className="py-2 text-right font-mono">{d.cantidad}</td>
                    <td className="py-2 text-right font-mono">{formatearMonto(d.subtotal, monedaActiva.decimales)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="pt-3 text-xs font-semibold text-emerald-800">Total en caja ({monedaActiva.codigo})</td>
                  <td className="pt-3 text-right font-mono text-xs text-slate-500">{monedaActiva.cantidadBilletes}</td>
                  <td className="pt-3 text-right text-lg font-bold font-mono text-emerald-700">
                    {monedaActiva.simbolo || monedaActiva.codigo} {formatearMonto(monedaActiva.total, monedaActiva.decimales)}
                  </td>
                </tr>
              </tfoot>
            </table>
          ) : (
            <p className="text-xs text-slate-400">{cargando ? 'Cargando…' : 'Sin monedas con billetes configurados.'}</p>
          )}
        </div>

        {/* MOVIMIENTOS RECIENTES */}
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 space-y-3">
          <h3 className="font-semibold text-sm text-slate-800 border-b pb-2">📋 Últimos movimientos</h3>
          {movimientos.length === 0 && <p className="text-xs text-slate-400">Todavía no hay movimientos.</p>}
          {movimientos.map(mov => {
            const estilo = ESTILO_TIPO[mov.tipo]
            return (
              <div key={mov.id} className="p-2.5 rounded-lg bg-slate-50 text-xs space-y-1">
                <div className="flex justify-between items-center gap-2">
                  <span className={`px-2 py-0.5 rounded font-bold ${estilo.clase}`}>{mov.tipoDisplay}</span>
                  <span className="font-mono font-bold">{estilo.signo}{formatearMonto(mov.total)} {mov.monedaCodigo}</span>
                </div>
                <div className="text-[10px] text-slate-400">
                  {fechaCorta(mov.creadoEn)} · {mov.usuarioNombre}
                  {mov.observacion && ` · ${mov.observacion}`}
                </div>
                <div className="text-[10px] text-slate-500">
                  {mov.detalle.map(d => `${d.cantidad} × ${formatearMonto(d.valor)}`).join(', ')}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ARQUEOS / CIERRES DE TURNO */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 space-y-3">
        <h3 className="font-semibold text-sm text-slate-800 border-b pb-2">🧾 Arqueos y cierres de turno</h3>
        {arqueos.length === 0 && <p className="text-xs text-slate-400">Todavía no se registraron arqueos.</p>}
        {arqueos.map(a => {
          const diferencias = a.detalle.filter(d => d.diferencia !== 0)
          return (
            <div key={a.id} className="flex flex-col sm:flex-row sm:justify-between gap-1 p-2.5 rounded-lg bg-slate-50 text-xs">
              <div>
                <span className="font-semibold">{fechaCorta(a.creadoEn)} · {a.usuarioNombre}</span>
                {a.observacion && <span className="text-slate-400"> · {a.observacion}</span>}
                {diferencias.length > 0 && (
                  <div className="text-[10px] text-rose-600">
                    {diferencias.map(d => `${d.monedaCodigo} ${formatearMonto(d.valor)}: ${d.diferencia > 0 ? '+' : ''}${d.diferencia}`).join(' · ')}
                  </div>
                )}
              </div>
              <span className={`self-start px-2 py-0.5 rounded font-bold ${a.conDiferencias ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
                {a.conDiferencias ? 'Con diferencias' : 'Cuadrado'}
              </span>
            </div>
          )
        })}
      </div>

      {modal === 'movimiento' && cajaId !== null && monedaActiva && (
        <ModalMovimiento
          cajaId={cajaId}
          saldo={saldo}
          monedaInicial={monedaActiva.codigo}
          permitirEntrega={esAdmin}
          onCerrar={() => setModal(null)}
          onRegistrado={alRegistrarMovimiento}
        />
      )}
      {modal === 'arqueo' && cajaId !== null && (
        <ModalArqueo
          cajaId={cajaId}
          saldo={saldo}
          onCerrar={() => setModal(null)}
          onRegistrado={alRegistrarArqueo}
        />
      )}
    </div>
  )
}

// ----------------------------------------------------------------------


/**
 * Ventana modal con encabezado y botones fijos: solo se desplaza el
 * contenido del medio, así "Guardar" queda siempre a la vista. Mientras
 * está abierta, la página de fondo no scrollea (un solo scroll).
 */
function Modal({
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

function BotonesModal({ onCerrar, textoConfirmar, deshabilitado }: {
  onCerrar: () => void
  textoConfirmar: string
  deshabilitado: boolean
}) {
  return (
    <div className="flex gap-2">
      <button type="button" onClick={onCerrar} className="flex-1 py-2.5 border border-slate-300 rounded-lg bg-white text-slate-600 font-semibold">Cancelar</button>
      <button type="submit" disabled={deshabilitado} className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg disabled:opacity-50">
        {textoConfirmar}
      </button>
    </div>
  )
}

/** Campo numérico de cantidad de billetes (enteros, sin negativos). */
function CampoCantidad({ id, valor, onCambio, error = false, mostrarCero = false }: {
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

function ModalMovimiento({
  cajaId, saldo, monedaInicial, permitirEntrega, onCerrar, onRegistrado,
}: {
  cajaId: number
  saldo: SaldoMoneda[]
  monedaInicial: string
  permitirEntrega: boolean
  onCerrar: () => void
  onRegistrado: (mov: MovimientoCaja, saldo: SaldoMoneda[]) => void
}) {
  const [tipo, setTipo] = useState<TipoMovimiento>('INGRESO')
  const [codigo, setCodigo] = useState(monedaInicial)
  const [cantidades, setCantidades] = useState<Record<number, number>>({})
  const [observacion, setObservacion] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')

  const moneda = saldo.find(m => m.codigo === codigo) ?? saldo[0]
  const lineas = moneda.denominaciones.map(d => ({ ...d, pedida: cantidades[d.denominacion] ?? 0 }))
  const total = lineas.reduce((acc, l) => acc + l.valor * l.pedida, 0)
  const excedidas = tipo === 'RETIRO' ? lineas.filter(l => l.pedida > l.cantidad) : []
  const puedeConfirmar = total > 0 && excedidas.length === 0 && !enviando

  const confirmar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!puedeConfirmar) return
    setEnviando(true)
    setError('')
    try {
      const res = await registrarMovimiento(cajaId, {
        tipo,
        moneda: moneda.moneda,
        detalle: lineas.filter(l => l.pedida > 0).map(l => ({ denominacion: l.denominacion, cantidad: l.pedida })),
        observacion: observacion.trim(),
      })
      onRegistrado(res.movimiento, res.saldo)
    } catch (err) {
      setError((err as Error).message)
      setEnviando(false)
    }
  }

  const pie = (
    <>
      {excedidas.length > 0 && (
        <p className="text-rose-600">
          No hay billetes suficientes de {excedidas.map(l => formatearMonto(l.valor, moneda.decimales)).join(', ')}.
        </p>
      )}
      {error && <p role="alert" className="text-rose-600">{error}</p>}
      <div className="flex justify-between items-center">
        <span className="text-slate-600 font-medium">Total del movimiento</span>
        <span className="text-lg font-bold font-mono text-emerald-700" data-testid="total-movimiento">
          {moneda.simbolo || moneda.codigo} {formatearMonto(total, moneda.decimales)}
        </span>
      </div>
      <BotonesModal
        onCerrar={onCerrar}
        textoConfirmar={enviando ? 'Registrando…' : 'Confirmar movimiento'}
        deshabilitado={!puedeConfirmar}
      />
    </>
  )

  return (
    <Modal titulo="Registrar movimiento de efectivo" onCerrar={onCerrar} onSubmit={confirmar} pie={pie}>
      <div className="grid grid-cols-2 gap-3">
        <label className="font-semibold text-slate-600 space-y-1 block">
          <span>Tipo</span>
          <select value={tipo} onChange={e => setTipo(e.target.value as TipoMovimiento)} className="w-full p-2.5 border border-slate-200 rounded-lg bg-white">
            <option value="INGRESO">Ingreso</option>
            <option value="RETIRO">Retiro</option>
            {permitirEntrega && <option value="ENTREGA">Entrega a cajero</option>}
          </select>
        </label>
        <label className="font-semibold text-slate-600 space-y-1 block">
          <span>Moneda</span>
          <select
            value={moneda.codigo}
            onChange={e => { setCodigo(e.target.value); setCantidades({}) }}
            className="w-full p-2.5 border border-slate-200 rounded-lg bg-white"
          >
            {saldo.map(m => <option key={m.codigo} value={m.codigo}>{m.codigo} - {m.nombre}</option>)}
          </select>
        </label>
      </div>

      <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
        {lineas.map(l => (
          <div key={l.denominacion} className="flex items-center justify-between gap-3 px-3 py-2">
            <label htmlFor={`mov-${l.denominacion}`} className="font-semibold text-slate-700">
              Billete {textoBillete(moneda, l.valor)}
            </label>
            <div className="flex items-center gap-3">
              {tipo === 'RETIRO' && <span className="text-[10px] text-slate-400">Disponibles: {l.cantidad}</span>}
              <CampoCantidad
                id={`mov-${l.denominacion}`}
                valor={l.pedida}
                error={tipo === 'RETIRO' && l.pedida > l.cantidad}
                onCambio={n => setCantidades({ ...cantidades, [l.denominacion]: n })}
              />
            </div>
          </div>
        ))}
      </div>

      <label className="font-semibold text-slate-600 space-y-1 block">
        <span>Observación</span>
        <input
          type="text"
          maxLength={255}
          value={observacion}
          onChange={e => setObservacion(e.target.value)}
          placeholder="Ej. Remesa de transportadora de valores"
          className="w-full p-2.5 border border-slate-200 rounded-lg"
        />
      </label>
    </Modal>
  )
}

function ModalArqueo({
  cajaId, saldo, onCerrar, onRegistrado,
}: {
  cajaId: number
  saldo: SaldoMoneda[]
  onCerrar: () => void
  onRegistrado: (arqueo: Arqueo) => void
}) {
  // Arranca con lo que dice el sistema; el cajero corrige lo que difiera.
  const [contado, setContado] = useState<Record<number, number>>(() => Object.fromEntries(
    saldo.flatMap(m => m.denominaciones.map(d => [d.denominacion, d.cantidad])),
  ))
  const [codigo, setCodigo] = useState(
    () => (saldo.find(m => m.cantidadBilletes > 0) ?? saldo[0])?.codigo ?? '',
  )
  const [observacion, setObservacion] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')

  const diferenciasDe = (m: SaldoMoneda) =>
    m.denominaciones.filter(d => (contado[d.denominacion] ?? 0) !== d.cantidad).length
  const conDiferencias = saldo.filter(m => diferenciasDe(m) > 0)
  const moneda = saldo.find(m => m.codigo === codigo) ?? saldo[0]

  const confirmar = async (e: React.FormEvent) => {
    e.preventDefault()
    setEnviando(true)
    setError('')
    const conteo = saldo.flatMap(m => m.denominaciones)
      .filter(d => d.cantidad > 0 || (contado[d.denominacion] ?? 0) > 0)
      .map(d => ({ denominacion: d.denominacion, cantidad: contado[d.denominacion] ?? 0 }))
    try {
      onRegistrado(await registrarArqueo(cajaId, conteo, observacion.trim()))
    } catch (err) {
      setError((err as Error).message)
      setEnviando(false)
    }
  }

  const pie = (
    <>
      <p className={conDiferencias.length ? 'text-rose-600 font-semibold' : 'text-emerald-700 font-semibold'}>
        {conDiferencias.length
          ? `Hay diferencias en ${conDiferencias.map(m => m.codigo).join(', ')}.`
          : 'Todo coincide con el sistema.'}
      </p>
      {error && <p role="alert" className="text-rose-600">{error}</p>}
      <BotonesModal
        onCerrar={onCerrar}
        textoConfirmar={enviando ? 'Guardando…' : 'Guardar arqueo'}
        deshabilitado={enviando}
      />
    </>
  )

  return (
    <Modal titulo="Registrar arqueo de caja" onCerrar={onCerrar} onSubmit={confirmar} pie={pie}>
      <p className="text-slate-500">
        Contá los billetes de cada moneda y corregí las cantidades que no coincidan.
        El arqueo queda como respaldo; no modifica el saldo.
      </p>

      <div className="flex flex-wrap gap-1.5" aria-label="Moneda del arqueo">
        {saldo.map(m => {
          const difs = diferenciasDe(m)
          const activa = m.codigo === moneda.codigo
          return (
            <button
              key={m.codigo}
              type="button"
              aria-pressed={activa}
              onClick={() => setCodigo(m.codigo)}
              className={`px-3 py-1.5 rounded-lg font-bold border transition-all ${
                activa ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
              }`}
            >
              {m.codigo}
              {difs > 0 && <span className="ml-1.5 inline-block w-2 h-2 rounded-full bg-rose-500 align-middle" aria-label="con diferencias" />}
            </button>
          )
        })}
      </div>

      {moneda && (
        <div className="border border-slate-200 rounded-lg">
          <div className="grid grid-cols-[1fr_4.5rem_5rem_3rem] gap-3 px-3 py-2 text-[10px] font-semibold text-slate-400 border-b border-slate-200 bg-slate-50">
            <span>Billete</span>
            <span className="text-right">Sistema</span>
            <span className="text-right">Contado</span>
            <span className="text-right">Dif.</span>
          </div>
          <div className="divide-y divide-slate-100">
            {moneda.denominaciones.map(d => {
              const valor = contado[d.denominacion] ?? 0
              const dif = valor - d.cantidad
              return (
                <div key={d.denominacion} className="grid grid-cols-[1fr_4.5rem_5rem_3rem] items-center gap-3 px-3 py-1.5">
                  <label htmlFor={`arq-${d.denominacion}`} className="font-semibold">{textoBillete(moneda, d.valor)}</label>
                  <span className="text-right font-mono text-slate-500">{d.cantidad}</span>
                  <CampoCantidad
                    id={`arq-${d.denominacion}`}
                    valor={valor}
                    mostrarCero
                    error={dif !== 0}
                    onCambio={n => setContado({ ...contado, [d.denominacion]: n })}
                  />
                  <span className={`text-right font-mono font-bold ${dif === 0 ? 'text-slate-300' : 'text-rose-600'}`}>
                    {dif > 0 ? `+${dif}` : dif}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <label className="font-semibold text-slate-600 space-y-1 block">
        <span>Observación</span>
        <input
          type="text"
          maxLength={255}
          value={observacion}
          onChange={e => setObservacion(e.target.value)}
          placeholder="Ej. Cierre de turno mañana"
          className="w-full p-2.5 border border-slate-200 rounded-lg"
        />
      </label>
    </Modal>
  )
}
