/**
 * Control de caja del rol cajero (PI-44, PI-43, PI-78; ERS RF56/RF58).
 *
 * Muestra el saldo de efectivo de la caja por divisa. Desde PI-78 el
 * saldo se maneja por total de cada divisa (decisión de la Product Owner):
 * los ingresos y retiros se registran por monto, y el recuento (arqueo)
 * compara el total contado de cada moneda con el del sistema.
 *
 * PI-43: muestra las entregas de billetes del administrador pendientes de
 * confirmar. Es el único lugar donde se ven los billetes por denominación:
 * el cajero los cuenta y confirma (se suma el total de cada divisa) o
 * rechaza con un motivo. Todo se refresca solo cada 30 segundos.
 *
 * PI-79: la caja se abre al confirmar la entrega inicial y solo se puede
 * operar mientras está abierta. "Cerrar caja" pide el recuento final de
 * cada moneda y devuelve el efectivo a tesorería (el saldo queda en 0).
 *
 * @module CashCountView
 */
import { useCallback, useEffect, useState } from 'react'
import type { AuthUser } from '@/types'
import {
  cerrarCaja,
  confirmarEntrega,
  formatearMonto,
  listarArqueos,
  listarCajas,
  listarDenominaciones,
  listarEntregas,
  listarMovimientos,
  obtenerSaldo,
  obtenerAvisosReposicion,
  crearSolicitud,
  listarSolicitudes,
  type AvisoReposicion,
  type CatalogoMoneda,
  type SolicitudReposicion,
  obtenerTurno,
  rechazarEntrega,
  registrarArqueo,
  registrarMovimiento,
  type Arqueo,
  type Caja,
  type Entrega,
  type MovimientoCaja,
  type SaldoMoneda,
  type TipoMovimiento,
  type Turno,
} from '@/services/cajas'
import {
  BotonesModal,
  CampoCantidad,
  CampoMonto,
  Modal,
  TablaEntrega,
  fechaCorta,
  leerMonto,
  textoBillete,
  textoSolicitud,
} from './ComponentesCaja'

/** Propiedades de la vista de control de caja. */
export interface CashCountViewProps {
  /** Usuario autenticado. */
  auth?: AuthUser
}

/** Cada cuánto se vuelve a consultar el saldo (ms). */
export const INTERVALO_REFRESCO_MS = 30_000

const ESTILO_TIPO: Record<TipoMovimiento, { signo: string; clase: string }> = {
  INGRESO: { signo: '+', clase: 'bg-emerald-50 text-emerald-700' },
  ENTREGA: { signo: '+', clase: 'bg-sky-50 text-sky-700' },
  RETIRO: { signo: '−', clase: 'bg-rose-50 text-rose-700' },
  DEVOLUCION: { signo: '−', clase: 'bg-slate-100 text-slate-600' },
}

function horaCorta(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' })
}

/** Diferencia con signo, por ejemplo `+$ 20` o `−₲ 50.000`. */
function textoDiferencia(m: { simbolo: string; codigo: string; decimales: number }, dif: number): string {
  if (dif === 0) return '0'
  return `${dif > 0 ? '+' : '−'}${textoBillete(m, Math.abs(dif))}`
}

export default function CashCountView(_props: CashCountViewProps) {
  const [cajas, setCajas] = useState<Caja[]>([])
  const [cajaId, setCajaId] = useState<number | null>(null)
  const [saldo, setSaldo] = useState<SaldoMoneda[]>([])
  const [movimientos, setMovimientos] = useState<MovimientoCaja[]>([])
  const [arqueos, setArqueos] = useState<Arqueo[]>([])
  const [pendientes, setPendientes] = useState<Entrega[]>([])
  const [turno, setTurno] = useState<Turno | null>(null)
  const [entregaSel, setEntregaSel] = useState<Entrega | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [actualizado, setActualizado] = useState<Date | null>(null)
  const [modal, setModal] = useState<'movimiento' | 'arqueo' | 'cierre' | 'solicitud' | null>(null)
  // PI-80: avisos de saldo bajo y pedidos de reposición del cajero.
  const [avisosReposicion, setAvisosReposicion] = useState<AvisoReposicion[]>([])
  const [solicitudes, setSolicitudes] = useState<SolicitudReposicion[]>([])
  const [avisoPedido, setAvisoPedido] = useState<AvisoReposicion | null>(null)

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
      const [s, m, a, e, t, avisos, sols] = await Promise.all([
        obtenerSaldo(id),
        listarMovimientos(id, { limite: 10 }),
        listarArqueos(id, 5),
        listarEntregas({ caja: id, estado: 'PENDIENTE' }),
        obtenerTurno(id),
        // El aviso y el pedido no son el centro de esta pantalla: si
        // fallan, el saldo y los movimientos siguen mostrando.
        obtenerAvisosReposicion(id).catch(() => [] as AvisoReposicion[]),
        listarSolicitudes({ caja: id }).catch(() => [] as SolicitudReposicion[]),
      ])
      setSaldo(s)
      setMovimientos(m)
      setArqueos(a)
      setPendientes(e)
      setTurno(t)
      setAvisosReposicion(avisos)
      setSolicitudes(sols)
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

  const cajaActual = cajas.find(c => c.id === cajaId)
  const simboloDe = (codigo: string) => saldo.find(m => m.codigo === codigo)

  /** PI-80: el cajero envió el pedido; lo sumo al instante y cierro. */
  const alSolicitarReposicion = (solicitud: SolicitudReposicion) => {
    setSolicitudes(prev => [solicitud, ...prev])
    setAvisoPedido(null)
    setAviso(
      `Solicitud #${solicitud.id} enviada al administrador por `
      + `${textoSolicitud(solicitud, solicitud.monto)} de ${solicitud.monedaCodigo}.`,
    )
  }

  const alRegistrarMovimiento = (mov: MovimientoCaja, nuevoSaldo: SaldoMoneda[]) => {
    setSaldo(nuevoSaldo)
    setMovimientos(prev => [mov, ...prev].slice(0, 10))
    setActualizado(new Date())
    setModal(null)
    setAviso(`${mov.tipoDisplay} registrado. Saldo actualizado.`)
  }

  const alResponderEntrega = (entrega: Entrega, nuevoSaldo?: SaldoMoneda[], nuevoTurno?: Turno | null) => {
    setEntregaSel(null)
    setPendientes(prev => prev.filter(e => e.id !== entrega.id))
    if (nuevoSaldo) {
      const abrio = !turno && Boolean(nuevoTurno)
      setSaldo(nuevoSaldo)
      setTurno(nuevoTurno ?? null)
      setActualizado(new Date())
      setAviso(abrio
        ? `Caja abierta con la entrega #${entrega.id}. Ya podés operar.`
        : `Entrega #${entrega.id} confirmada. Se sumó al saldo de la caja.`)
      if (cajaId !== null) listarMovimientos(cajaId, { limite: 10 }).then(setMovimientos).catch(() => {})
    } else {
      setAviso(`Entrega #${entrega.id} rechazada. El administrador verá el motivo.`)
    }
  }

  const alRegistrarArqueo = (arqueo: Arqueo) => {
    setArqueos(prev => [arqueo, ...prev].slice(0, 5))
    setModal(null)
    setAviso(arqueo.conDiferencias
      ? 'Arqueo registrado CON diferencias. Revisá el detalle.'
      : 'Arqueo registrado sin diferencias.')
  }

  const alCerrarCaja = (cerrado: Turno, nuevoSaldo: SaldoMoneda[]) => {
    setTurno(null)
    setSaldo(nuevoSaldo)
    setModal(null)
    setActualizado(new Date())
    if (cerrado.arqueoCierre) setArqueos(prev => [cerrado.arqueoCierre as Arqueo, ...prev].slice(0, 5))
    if (cajaId !== null) listarMovimientos(cajaId, { limite: 10 }).then(setMovimientos).catch(() => {})
    setAviso(cerrado.arqueoCierre?.conDiferencias
      ? 'Caja cerrada CON diferencias. El efectivo se devolvió a tesorería.'
      : 'Caja cerrada sin diferencias. El efectivo se devolvió a tesorería.')
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
          {!cargando && (
            <p
              data-testid="estado-caja"
              className={`mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${
                turno ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${turno ? 'bg-emerald-500' : 'bg-slate-400'}`} />
              {turno ? `Caja abierta desde las ${horaCorta(turno.abiertoEn)} · ${turno.cajeroNombre}` : 'Caja cerrada'}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {cajas.length > 1 ? (
            <select
              aria-label="Caja"
              value={cajaId ?? ''}
              onChange={e => setCajaId(Number(e.target.value))}
              className="px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold bg-white"
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
            className="px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            ↻ Actualizar
          </button>
          <button
            onClick={() => { setAviso(''); setModal('arqueo') }}
            disabled={!turno || saldo.length === 0}
            className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            🧾 Registrar arqueo
          </button>
          <button
            onClick={() => { setAviso(''); setModal('movimiento') }}
            disabled={!turno || saldo.length === 0}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-lg shadow-sm disabled:opacity-50"
          >
            💵 Registrar movimiento
          </button>
          {turno && (
            <button
              onClick={() => { setAviso(''); setModal('cierre') }}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded-lg shadow-sm"
            >
              🔒 Cerrar caja
            </button>
          )}
        </div>
      </div>

      {error && (
        <div role="alert" className="bg-rose-50 border border-rose-200 text-rose-700 rounded-lg p-3 text-xs">{error}</div>
      )}
      {aviso && (
        <div role="status" className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg p-3 text-xs">{aviso}</div>
      )}

      {!cargando && !turno && cajas.length > 0 && (
        <div role="note" className="bg-slate-50 border border-slate-200 text-slate-600 rounded-lg p-3 text-xs">
          🔒 La caja está cerrada. Se abre al confirmar la entrega de billetes del administrador.
          {pendientes.length === 0 && ' Todavía no hay entregas pendientes.'}
        </div>
      )}

      {/* ENTREGAS PENDIENTES DE CONFIRMAR (PI-43) */}
      {pendientes.length > 0 && (
        <section aria-label="Entregas pendientes" className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
          <h3 className="font-semibold text-sm text-amber-900">
            📦 {pendientes.length === 1 ? 'Tenés 1 entrega de billetes pendiente' : `Tenés ${pendientes.length} entregas de billetes pendientes`} de confirmar
          </h3>
          {pendientes.map(e => (
            <div key={e.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white rounded-lg border border-amber-100 p-3 text-xs">
              <div className="space-y-0.5">
                <div className="font-bold text-slate-800">
                  Entrega #{e.id} · {e.totales.map(t => `${t.simbolo || t.monedaCodigo} ${formatearMonto(t.total, t.decimales)} ${t.monedaCodigo}`).join(' + ')}
                </div>
                <div className="text-[11px] text-slate-500">
                  {fechaCorta(e.creadoEn)} · de {e.entregadoPorNombre || 'Administrador'}
                  {e.observacion && ` · ${e.observacion}`}
                </div>
              </div>
              <button
                onClick={() => { setAviso(''); setEntregaSel(e) }}
                className="shrink-0 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-lg"
              >
                Revisar y confirmar
              </button>
            </div>
          ))}
        </section>
      )}

      {/* SALDO POR DIVISA (PI-78) */}
      <section aria-label="Saldo por divisa" className="space-y-2">
        <h3 className="font-semibold text-sm text-slate-700">Saldo en caja</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {saldo.map(m => (
            <div
              key={m.codigo}
              className={`p-3 rounded-xl border bg-white ${m.total > 0 ? 'border-emerald-200' : 'border-slate-100'}`}
            >
              <div className="text-xs font-bold text-slate-600">{m.flag} {m.codigo}</div>
              <div className={`text-base font-bold font-mono truncate ${m.total > 0 ? 'text-slate-900' : 'text-slate-300'}`} data-testid={`total-${m.codigo}`}>
                {textoBillete(m, m.total)}
              </div>
              <div className="text-[10px] text-slate-400 truncate">{m.nombre}</div>
            </div>
          ))}
          {cargando && saldo.length === 0 && <p className="text-xs text-slate-400">Cargando…</p>}
        </div>
      </section>

      {/* REPOSICIÓN (PI-80) */}
      {cajaId !== null && (avisosReposicion.length > 0 || solicitudes.length > 0) && (
        <section aria-label="Reposición de billetes" className="space-y-2">
          <h3 className="font-semibold text-sm text-slate-700">Reposición de billetes</h3>

          {avisosReposicion.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
              <p className="text-xs text-amber-900">
                <strong className="font-semibold">Saldo bajo.</strong>{' '}
                Estas divisas quedaron por debajo del mínimo de la caja. Pedile al administrador
                la reposición para poder seguir atendiendo.
              </p>
              <ul className="space-y-2">
                {avisosReposicion.map(a => {
                  const yaPedida = solicitudes.some(
                    s => s.estado === 'PENDIENTE' && s.moneda === a.moneda,
                  )
                  return (
                    <li key={a.moneda} className="flex items-center justify-between gap-3 flex-wrap">
                      <span className="text-xs text-amber-900">
                        <strong className="font-mono font-bold">{a.codigo}</strong>{' '}
                        tenés {textoBillete(a, a.total)} de {textoBillete(a, a.saldoMinimo)} ·{' '}
                        faltan{' '}
                        <strong className="font-mono font-bold">
                          {textoBillete(a, a.faltante)}
                        </strong>
                      </span>
                      <button
                        type="button"
                        disabled={yaPedida}
                        onClick={() => setAvisoPedido(a)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-amber-300 bg-white text-amber-900 hover:bg-amber-100 disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {yaPedida ? 'Pedido enviado' : 'Solicitar reposición'}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          {solicitudes.length > 0 && (
            <ul className="space-y-1.5">
              {solicitudes.slice(0, 5).map(s => (
                <li
                  key={s.id}
                  className="flex items-center justify-between gap-3 text-xs border border-slate-100 bg-white rounded-lg px-3 py-2"
                >
                  <span className="text-slate-700">
                    <span className="font-mono font-bold">{s.monedaCodigo}</span>{' '}
                    {textoSolicitud(s, s.monto)} · {fechaCorta(s.creadoEn)} · {s.cajeroNombre}
                    {s.motivo && <span className="text-slate-500"> · {s.motivo}</span>}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded font-bold ${
                      s.estado === 'PENDIENTE'
                        ? 'bg-amber-100 text-amber-800'
                        : s.estado === 'ATENDIDA'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-rose-100 text-rose-800'
                    }`}
                  >
                    {s.estadoDisplay}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        {/* MOVIMIENTOS RECIENTES */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-100 shadow-sm p-5 space-y-3">
          <h3 className="font-semibold text-sm text-slate-800 border-b border-slate-100 pb-2">📋 Últimos movimientos</h3>
          {movimientos.length === 0 && <p className="text-xs text-slate-400">Todavía no hay movimientos.</p>}
          <div className="divide-y divide-slate-100">
            {movimientos.map(mov => {
              const estilo = ESTILO_TIPO[mov.tipo]
              const moneda = simboloDe(mov.monedaCodigo) ?? { simbolo: '', codigo: mov.monedaCodigo, decimales: 2 }
              return (
                <div key={mov.id} className="flex items-center justify-between gap-3 py-2.5 text-xs">
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded font-bold ${estilo.clase}`}>{mov.tipoDisplay}</span>
                      <span className="text-[11px] text-slate-400">{fechaCorta(mov.creadoEn)} · {mov.usuarioNombre}</span>
                    </div>
                    {mov.observacion && <div className="text-[11px] text-slate-500 truncate">{mov.observacion}</div>}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono font-bold">{estilo.signo}{textoBillete(moneda, mov.total)} {mov.monedaCodigo}</div>
                    {mov.saldoResultante !== null && (
                      <div className="text-[10px] text-slate-400">Saldo: {textoBillete(moneda, mov.saldoResultante)}</div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* ARQUEOS */}
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 space-y-3">
          <h3 className="font-semibold text-sm text-slate-800 border-b border-slate-100 pb-2">🧾 Arqueos y cierres</h3>
          {arqueos.length === 0 && <p className="text-xs text-slate-400">Todavía no se registraron arqueos.</p>}
          {arqueos.map(a => {
            const diferencias = a.detalle.filter(d => d.diferencia !== 0)
            return (
              <div key={a.id} className="p-2.5 rounded-lg bg-slate-50 text-xs space-y-1">
                <div className="flex justify-between items-start gap-2">
                  <span className="font-semibold">
                    {a.esCierre && <span className="mr-1 px-1.5 py-0.5 rounded bg-slate-900 text-white text-[10px]">Cierre</span>}
                    {fechaCorta(a.creadoEn)} · {a.usuarioNombre}
                  </span>
                  <span className={`shrink-0 px-2 py-0.5 rounded font-bold ${a.conDiferencias ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
                    {a.conDiferencias ? 'Con diferencias' : 'Cuadrado'}
                  </span>
                </div>
                {a.observacion && <div className="text-[11px] text-slate-400">{a.observacion}</div>}
                {diferencias.map(d => (
                  <div key={d.moneda} className="text-[11px] text-rose-600">
                    {d.monedaCodigo}: {d.diferencia < 0 ? 'faltante' : 'sobrante'} {textoDiferencia({ ...d, codigo: d.monedaCodigo }, d.diferencia)}
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </div>

      {modal === 'movimiento' && cajaId !== null && (
        <ModalMovimiento
          cajaId={cajaId}
          saldo={saldo}
          onCerrar={() => setModal(null)}
          onRegistrado={alRegistrarMovimiento}
        />
      )}
      {entregaSel && (
        <ModalEntrega
          entrega={entregaSel}
          onCerrar={() => setEntregaSel(null)}
          onRespondida={alResponderEntrega}
        />
      )}
      {avisoPedido && cajaId !== null && (
        <ModalSolicitud
          cajaId={cajaId}
          aviso={avisoPedido}
          onCerrar={() => setAvisoPedido(null)}
          onEnviada={alSolicitarReposicion}
        />
      )}
      {(modal === 'arqueo' || modal === 'cierre') && cajaId !== null && (
        <ModalArqueo
          modo={modal}
          cajaId={cajaId}
          saldo={saldo}
          onCerrar={() => setModal(null)}
          onRegistrado={alRegistrarArqueo}
          onCajaCerrada={alCerrarCaja}
        />
      )}
    </div>
  )
}

// ----------------------------------------------------------------------

/**
 * Pedido de reposición de billetes (PI-80).
 *
 * El monto es lo obligatorio: si el cajero además sabe qué billetes le
 * faltan, los carga uno por uno. Si no, alcanza con el total y lo define
 * el administrador al registrar la entrega.
 */
function ModalSolicitud({ cajaId, aviso, onCerrar, onEnviada }: {
  cajaId: number
  aviso: AvisoReposicion
  onCerrar: () => void
  onEnviada: (solicitud: SolicitudReposicion) => void
}) {
  const [monto, setMonto] = useState(String(aviso.faltante))
  const [cantidades, setCantidades] = useState<Record<number, number>>({})
  const [observacion, setObservacion] = useState('')
  const [billetes, setBilletes] = useState<CatalogoMoneda[]>([])
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    listarDenominaciones()
      .then(lista => setBilletes(lista.filter(m => m.codigo === aviso.codigo)))
      .catch(() => setBilletes([]))
  }, [aviso.codigo])

  const lectura = leerMonto(monto, aviso.decimales)
  const problema = 'error' in lectura ? lectura.error : ''
  const valor = 'monto' in lectura ? lectura.monto : null
  const detalle = Object.entries(cantidades)
    .filter(([, c]) => c > 0)
    .map(([denominacion, cantidad]) => ({ denominacion: Number(denominacion), cantidad }))
  // Si Detailed se pidió algo, tiene que sumar al menos el monto pedido.
  const detalleNoVacio = detalle.length > 0
  const puedeEnviar = valor !== null && !problema && !enviando

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!puedeEnviar || valor === null) return
    setEnviando(true)
    setError('')
    try {
      onEnviada(await crearSolicitud({
        caja: cajaId,
        moneda: aviso.moneda,
        monto: String(valor),
        detalle,
        observacion: observacion.trim(),
      }))
    } catch (err) {
      setError((err as Error).message)
      setEnviando(false)
    }
  }

  const pie = (
    <>
      {error && <p role="alert" className="text-rose-600">{error}</p>}
      <BotonesModal
        onCerrar={onCerrar}
        textoConfirmar={enviando ? 'Enviando…' : 'Enviar solicitud'}
        deshabilitado={!puedeEnviar}
      />
    </>
  )

  return (
    <Modal titulo={`Solicitar reposición de ${aviso.codigo}`} onCerrar={onCerrar} onSubmit={enviar} pie={pie}>
      <p className="text-slate-600">
        Tenés <strong className="font-mono">{textoBillete(aviso, aviso.total)}</strong> y el
        mínimo de la caja es <strong className="font-mono">{textoBillete(aviso, aviso.saldoMinimo)}</strong>.
      </p>

      <label className="font-semibold text-slate-600 space-y-1 block">
        <span>Monto que necesitás ({aviso.codigo})</span>
        <CampoMonto
          id="monto-solicitud"
          valor={monto}
          onCambio={setMonto}
          decimales={aviso.decimales}
          error={!!problema}
        />
      </label>

      {billetes.length > 0 && (
        <div className="space-y-2">
          <p className="font-semibold text-slate-600">
            ¿Qué billetes te faltan? <span className="font-normal text-slate-400">(opcional)</span>
          </p>
          <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
            {billetes.flatMap(m => m.denominaciones).map(d => (
              <div key={d.denominacion} className="flex items-center justify-between gap-3 px-3 py-2">
                <label htmlFor={`sol-${d.denominacion}`} className="font-semibold text-slate-700">
                  Billete {textoBillete(aviso, d.valor)}
                </label>
                <CampoCantidad
                  id={`sol-${d.denominacion}`}
                  valor={cantidades[d.denominacion] ?? 0}
                  onCambio={n => setCantidades({ ...cantidades, [d.denominacion]: n })}
                />
              </div>
            ))}
          </div>
          {detalleNoVacio && (
            <p className="text-[11px] text-slate-400">
              Lo que carga el administrador es el detalle de arriba; el monto es el total que pedís.
            </p>
          )}
        </div>
      )}

      <label className="font-semibold text-slate-600 space-y-1 block">
        <span>Observación</span>
        <input
          type="text"
          maxLength={255}
          placeholder="Opcional"
          value={observacion}
          onChange={e => setObservacion(e.target.value)}
          className="w-full px-3 py-2 border border-slate-200 rounded-lg"
        />
      </label>
    </Modal>
  )
}

function ModalMovimiento({ cajaId, saldo, onCerrar, onRegistrado }: {
  cajaId: number
  saldo: SaldoMoneda[]
  onCerrar: () => void
  onRegistrado: (mov: MovimientoCaja, saldo: SaldoMoneda[]) => void
}) {
  const [tipo, setTipo] = useState<'INGRESO' | 'RETIRO'>('INGRESO')
  const [codigo, setCodigo] = useState(() => (saldo.find(m => m.total > 0) ?? saldo[0]).codigo)
  const [texto, setTexto] = useState('')
  const [observacion, setObservacion] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')

  const moneda = saldo.find(m => m.codigo === codigo) ?? saldo[0]
  const lectura = texto ? leerMonto(texto, moneda.decimales) : null
  const monto = lectura && 'monto' in lectura ? lectura.monto : null
  const excede = tipo === 'RETIRO' && monto !== null && monto > moneda.total
  const problema = lectura && 'error' in lectura ? lectura.error
    : excede ? `No alcanza el saldo: hay ${textoBillete(moneda, moneda.total)}.` : ''
  const puedeConfirmar = monto !== null && !excede && !enviando

  const confirmar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!puedeConfirmar || monto === null) return
    setEnviando(true)
    setError('')
    try {
      const res = await registrarMovimiento(cajaId, {
        tipo, moneda: moneda.moneda, monto, observacion: observacion.trim(),
      })
      onRegistrado(res.movimiento, res.saldo)
    } catch (err) {
      setError((err as Error).message)
      setEnviando(false)
    }
  }

  const pie = (
    <>
      {problema && <p className="text-rose-600">{problema}</p>}
      {error && <p role="alert" className="text-rose-600">{error}</p>}
      <div className="flex justify-between items-center">
        <span className="text-slate-600 font-medium">Saldo después del movimiento</span>
        <span className="text-lg font-bold font-mono text-emerald-700" data-testid="saldo-despues">
          {excede ? '—' : textoBillete(moneda, moneda.total + (monto ?? 0) * (tipo === 'INGRESO' ? 1 : -1))}
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
          <select value={tipo} onChange={e => setTipo(e.target.value as 'INGRESO' | 'RETIRO')} className="w-full p-2.5 border border-slate-200 rounded-lg bg-white">
            <option value="INGRESO">Ingreso</option>
            <option value="RETIRO">Retiro</option>
          </select>
        </label>
        <label className="font-semibold text-slate-600 space-y-1 block">
          <span>Moneda</span>
          <select value={moneda.codigo} onChange={e => setCodigo(e.target.value)} className="w-full p-2.5 border border-slate-200 rounded-lg bg-white">
            {saldo.map(m => <option key={m.codigo} value={m.codigo}>{m.codigo} - {m.nombre}</option>)}
          </select>
        </label>
      </div>

      <div className="space-y-1">
        <div className="flex justify-between font-semibold text-slate-600">
          <label htmlFor="monto-movimiento">Monto ({moneda.codigo})</label>
          <span className="font-normal text-slate-400">Saldo actual: {textoBillete(moneda, moneda.total)}</span>
        </div>
        <CampoMonto
          id="monto-movimiento"
          valor={texto}
          onCambio={setTexto}
          decimales={moneda.decimales}
          error={Boolean(problema)}
        />
      </div>

      <label className="font-semibold text-slate-600 space-y-1 block">
        <span>Observación</span>
        <input
          type="text"
          maxLength={255}
          value={observacion}
          onChange={e => setObservacion(e.target.value)}
          placeholder="Ej. Ajuste por diferencia de arqueo"
          className="w-full p-2.5 border border-slate-200 rounded-lg"
        />
      </label>
    </Modal>
  )
}

/**
 * Recuento de la caja por moneda (sistema vs. contado). En modo `arqueo`
 * solo deja constancia; en modo `cierre` además cierra la caja y devuelve
 * el efectivo a tesorería (PI-79).
 */
function ModalArqueo({ modo, cajaId, saldo, onCerrar, onRegistrado, onCajaCerrada }: {
  modo: 'arqueo' | 'cierre'
  cajaId: number
  saldo: SaldoMoneda[]
  onCerrar: () => void
  onRegistrado: (arqueo: Arqueo) => void
  onCajaCerrada: (turno: Turno, saldo: SaldoMoneda[]) => void
}) {
  const esCierre = modo === 'cierre'
  // Arranca con el total del sistema; el cajero corrige lo que difiera.
  const [contado, setContado] = useState<Record<string, string>>(() => Object.fromEntries(
    saldo.map(m => [m.codigo, String(m.total)]),
  ))
  const [observacion, setObservacion] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')

  const filas = saldo.map(m => {
    const lectura = leerMonto(contado[m.codigo] ?? '', m.decimales, true)
    const monto = 'monto' in lectura ? lectura.monto : null
    return { m, monto, problema: 'error' in lectura ? lectura.error : '', diferencia: monto === null ? 0 : monto - m.total }
  })
  const invalidas = filas.filter(f => f.problema)
  const conDiferencias = filas.filter(f => !f.problema && f.diferencia !== 0)

  const confirmar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (invalidas.length) return
    setEnviando(true)
    setError('')
    const conteo = filas
      .filter(f => f.m.total > 0 || (f.monto ?? 0) > 0)
      .map(f => ({ moneda: f.m.moneda, monto: f.monto ?? 0 }))
    try {
      if (esCierre) {
        const res = await cerrarCaja(cajaId, conteo, observacion.trim())
        onCajaCerrada(res.turno, res.saldo)
      } else {
        onRegistrado(await registrarArqueo(cajaId, conteo, observacion.trim()))
      }
    } catch (err) {
      setError((err as Error).message)
      setEnviando(false)
    }
  }

  const pie = (
    <>
      <p className={invalidas.length || conDiferencias.length ? 'text-rose-600 font-semibold' : 'text-emerald-700 font-semibold'}>
        {invalidas.length
          ? `Revisá el monto de ${invalidas.map(f => f.m.codigo).join(', ')}.`
          : conDiferencias.length
            ? `Hay diferencias en ${conDiferencias.map(f => f.m.codigo).join(', ')}.`
            : 'Todo coincide con el sistema.'}
      </p>
      {error && <p role="alert" className="text-rose-600">{error}</p>}
      <BotonesModal
        onCerrar={onCerrar}
        textoConfirmar={enviando ? 'Guardando…' : esCierre ? 'Cerrar caja' : 'Guardar arqueo'}
        textoCerrar={esCierre ? 'Volver' : 'Cancelar'}
        deshabilitado={enviando || invalidas.length > 0}
      />
    </>
  )

  return (
    <Modal
      titulo={esCierre ? 'Cerrar caja' : 'Registrar arqueo de caja'}
      onCerrar={onCerrar}
      onSubmit={confirmar}
      pie={pie}
    >
      {esCierre ? (
        <p className="text-slate-600">
          Hacé el recuento final: contá el efectivo de cada moneda y corregí el total si no coincide.
          Al cerrar, <strong>el efectivo se devuelve a tesorería</strong>, el saldo queda en 0 y no se
          puede operar hasta la próxima apertura.
        </p>
      ) : (
        <p className="text-slate-500">
          Contá el efectivo de cada moneda y corregí el total si no coincide con el sistema.
          El arqueo queda como respaldo; no modifica el saldo.
        </p>
      )}
      <div className="border border-slate-200 rounded-lg">
        <div className="grid grid-cols-[3.5rem_1fr_1fr_5.5rem] gap-3 px-3 py-2 text-[10px] font-semibold text-slate-400 border-b border-slate-200 bg-slate-50">
          <span>Moneda</span>
          <span className="text-right">Sistema</span>
          <span className="text-right">Contado</span>
          <span className="text-right">Diferencia</span>
        </div>
        <div className="divide-y divide-slate-100">
          {filas.map(({ m, problema, diferencia }) => (
            <div key={m.codigo} className="grid grid-cols-[3.5rem_1fr_1fr_5.5rem] items-center gap-3 px-3 py-1.5">
              <label htmlFor={`arq-${m.codigo}`} className="font-bold">{m.codigo}</label>
              <span className="text-right font-mono text-slate-500 truncate">{textoBillete(m, m.total)}</span>
              <CampoMonto
                id={`arq-${m.codigo}`}
                valor={contado[m.codigo] ?? ''}
                onCambio={t => setContado({ ...contado, [m.codigo]: t })}
                decimales={m.decimales}
                error={Boolean(problema) || diferencia !== 0}
              />
              <span className={`text-right font-mono font-bold truncate ${diferencia === 0 ? 'text-slate-300' : 'text-rose-600'}`}>
                {problema ? '—' : textoDiferencia(m, diferencia)}
              </span>
            </div>
          ))}
        </div>
      </div>
      <label className="font-semibold text-slate-600 space-y-1 block">
        <span>Observación</span>
        <input
          type="text"
          maxLength={255}
          value={observacion}
          onChange={e => setObservacion(e.target.value)}
          placeholder={esCierre ? 'Ej. Cierre del día' : 'Ej. Arqueo de media mañana'}
          className="w-full p-2.5 border border-slate-200 rounded-lg"
        />
      </label>
    </Modal>
  )
}

/**
 * Detalle de una entrega pendiente: el cajero cuenta los billetes y
 * confirma la recepción o la rechaza indicando el motivo.
 */
function ModalEntrega({ entrega, onCerrar, onRespondida }: {
  entrega: Entrega
  onCerrar: () => void
  onRespondida: (entrega: Entrega, saldo?: SaldoMoneda[], turno?: Turno | null) => void
}) {
  const [rechazando, setRechazando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')

  const responder = async (e: React.FormEvent) => {
    e.preventDefault()
    if (rechazando && !motivo.trim()) return
    setEnviando(true)
    setError('')
    try {
      if (rechazando) {
        onRespondida(await rechazarEntrega(entrega.id, motivo.trim()))
      } else {
        const res = await confirmarEntrega(entrega.id)
        onRespondida(res.entrega, res.saldo, res.turno)
      }
    } catch (err) {
      setError((err as Error).message)
      setEnviando(false)
    }
  }

  const pie = (
    <>
      {rechazando && (
        <label className="font-semibold text-slate-600 space-y-1 block">
          <span>Motivo del rechazo</span>
          <input
            type="text"
            maxLength={255}
            autoFocus
            value={motivo}
            onChange={e => setMotivo(e.target.value)}
            placeholder="Ej. Faltan 2 billetes de USD 100"
            className="w-full p-2.5 border border-slate-200 rounded-lg bg-white"
          />
        </label>
      )}
      {error && <p role="alert" className="text-rose-600">{error}</p>}
      {rechazando ? (
        <div className="flex gap-2">
          <button type="button" onClick={() => setRechazando(false)} className="flex-1 py-2.5 border border-slate-300 rounded-lg bg-white text-slate-600 font-semibold">
            Volver
          </button>
          <button type="submit" disabled={enviando || !motivo.trim()} className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-lg disabled:opacity-50">
            {enviando ? 'Enviando…' : 'Rechazar entrega'}
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <button type="button" onClick={() => setRechazando(true)} className="flex-1 py-2.5 border border-rose-200 rounded-lg bg-white text-rose-600 font-semibold">
            No coincide, rechazar
          </button>
          <button type="submit" disabled={enviando} className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg disabled:opacity-50">
            {enviando ? 'Confirmando…' : 'Confirmar recepción'}
          </button>
        </div>
      )}
    </>
  )

  return (
    <Modal titulo={`Entrega de billetes #${entrega.id}`} onCerrar={onCerrar} onSubmit={responder} pie={pie}>
      <p className="text-slate-500">
        {entrega.entregadoPorNombre || 'El administrador'} entregó estos billetes ({fechaCorta(entrega.creadoEn)}).
        Contalos antes de confirmar: al confirmar se suman al saldo de la caja.
      </p>
      {entrega.observacion && <p className="text-slate-600"><strong>Observación:</strong> {entrega.observacion}</p>}
      <TablaEntrega entrega={entrega} />
    </Modal>
  )
}
