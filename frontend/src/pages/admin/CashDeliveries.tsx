/**
 * Entregas de billetes a las cajas (PI-43, ERS RF57).
 *
 * El administrador registra los billetes que entrega a una caja, por
 * divisa y denominación (fondo de apertura o reposición de efectivo).
 * La entrega queda pendiente hasta que el cajero la cuenta y la confirma
 * en su pantalla de Arqueo de Caja; recién ahí se suma al saldo. Mientras
 * esté pendiente, el administrador puede cancelarla. La lista muestra el
 * estado, quién la recibió y cuándo, y se refresca sola.
 *
 * PI-79: muestra si cada caja está abierta (y por quién) o cerrada. Si
 * está cerrada, la entrega es la apertura; si está abierta, es una
 * reposición del turno en curso.
 *
 * @module CashDeliveries
 */
import { useCallback, useEffect, useState } from 'react'
import {
  cancelarEntrega,
  crearEntrega,
  formatearMonto,
  listarCajas,
  listarDenominaciones,
  listarEntregas,
  type Caja,
  type CatalogoMoneda,
  type Entrega,
  type EstadoEntrega,
} from '@/services/cajas'
import {
  BotonesModal,
  CampoCantidad,
  Modal,
  TablaEntrega,
  fechaCorta,
  textoBillete,
} from '@/pages/cashier/ComponentesCaja'
import { INTERVALO_REFRESCO_MS } from '@/pages/cashier/CashCountView'

const ESTILO_ESTADO: Record<EstadoEntrega, string> = {
  PENDIENTE: 'bg-amber-50 text-amber-700 border-amber-200',
  CONFIRMADA: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  RECHAZADA: 'bg-rose-50 text-rose-700 border-rose-200',
  CANCELADA: 'bg-slate-100 text-slate-500 border-slate-200',
}

const FILTROS: { valor: EstadoEntrega | ''; texto: string }[] = [
  { valor: '', texto: 'Todas' },
  { valor: 'PENDIENTE', texto: 'Pendientes' },
  { valor: 'CONFIRMADA', texto: 'Confirmadas' },
  { valor: 'RECHAZADA', texto: 'Rechazadas' },
  { valor: 'CANCELADA', texto: 'Canceladas' },
]

function textoTotales(e: Entrega): string {
  return e.totales
    .map(t => `${t.simbolo || t.monedaCodigo} ${formatearMonto(t.total, t.decimales)} ${t.monedaCodigo}`)
    .join(' + ')
}

export default function CashDeliveries() {
  const [cajas, setCajas] = useState<Caja[]>([])
  const [cajaFiltro, setCajaFiltro] = useState<number | 0>(0)
  const [estado, setEstado] = useState<EstadoEntrega | ''>('')
  const [entregas, setEntregas] = useState<Entrega[]>([])
  const [abierta, setAbierta] = useState<number | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [nueva, setNueva] = useState(false)
  const [aCancelar, setACancelar] = useState<Entrega | null>(null)

  const recargar = useCallback(async () => {
    try {
      const [lista, cajasActuales] = await Promise.all([
        listarEntregas({ caja: cajaFiltro || undefined, estado: estado || undefined }),
        listarCajas(),
      ])
      setEntregas(lista)
      setCajas(cajasActuales)
      setError('')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setCargando(false)
    }
  }, [cajaFiltro, estado])

  useEffect(() => {
    recargar()
    const intervalo = setInterval(recargar, INTERVALO_REFRESCO_MS)
    return () => clearInterval(intervalo)
  }, [recargar])

  const pendientes = entregas.filter(e => e.estado === 'PENDIENTE').length

  return (
    <div className="space-y-6 animate-fadein text-slate-800">
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <span className="text-xs font-bold text-sky-700 bg-sky-50 px-2.5 py-1 rounded-full uppercase tracking-wider">
            Tesorería
          </span>
          <h2 className="text-xl font-bold text-slate-900 mt-1" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
            Entregas de Billetes a Cajas
          </h2>
          <p className="text-xs text-slate-400">
            Fondo de apertura o reposición de efectivo. El cajero confirma la recepción antes de que se sume a su caja.
          </p>
        </div>
        <button
          onClick={() => { setAviso(''); setNueva(true) }}
          disabled={cajas.length === 0}
          className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-lg shadow-sm disabled:opacity-50"
        >
          + Nueva entrega
        </button>
      </div>

      {cajas.length > 0 && (
        <div className="flex flex-wrap gap-2" aria-label="Estado de las cajas">
          {cajas.map(c => (
            <span
              key={c.id}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold ${
                c.abierta ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-white border-slate-200 text-slate-500'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${c.abierta ? 'bg-emerald-500' : 'bg-slate-400'}`} />
              {c.sucursal} · {c.nombre}:{' '}
              {c.abierta && c.turnoActual
                ? `abierta por ${c.turnoActual.cajeroNombre} desde ${fechaCorta(c.turnoActual.abiertoEn)}`
                : 'cerrada'}
            </span>
          ))}
        </div>
      )}

      {error && <div role="alert" className="bg-rose-50 border border-rose-200 text-rose-700 rounded-lg p-3 text-xs">{error}</div>}
      {aviso && <div role="status" className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg p-3 text-xs">{aviso}</div>}

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5" aria-label="Filtrar por estado">
            {FILTROS.map(f => (
              <button
                key={f.valor || 'todas'}
                aria-pressed={estado === f.valor}
                onClick={() => setEstado(f.valor)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${
                  estado === f.valor ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                }`}
              >
                {f.texto}
              </button>
            ))}
          </div>
          {cajas.length > 1 && (
            <select
              aria-label="Filtrar por caja"
              value={cajaFiltro}
              onChange={e => setCajaFiltro(Number(e.target.value))}
              className="px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold bg-white"
            >
              <option value={0}>Todas las cajas</option>
              {cajas.map(c => <option key={c.id} value={c.id}>{c.sucursal} · {c.nombre}</option>)}
            </select>
          )}
        </div>

        {pendientes > 0 && estado !== 'PENDIENTE' && (
          <p className="text-xs text-amber-700">
            {pendientes === 1 ? '1 entrega esperando' : `${pendientes} entregas esperando`} confirmación del cajero.
          </p>
        )}

        {!cargando && entregas.length === 0 && (
          <p className="text-xs text-slate-400 py-6 text-center">No hay entregas para mostrar.</p>
        )}

        <div className="space-y-2">
          {entregas.map(e => (
            <div key={e.id} className="border border-slate-100 rounded-lg">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 p-3 text-xs">
                <div className="space-y-0.5 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-slate-900">#{e.id}</span>
                    <span className={`px-2 py-0.5 rounded border font-bold ${ESTILO_ESTADO[e.estado]}`}>{e.estadoDisplay}</span>
                    <span className="font-semibold text-slate-700">{e.cajaNombre}</span>
                  </div>
                  <div className="font-mono font-semibold text-slate-800">{textoTotales(e)}</div>
                  <div className="text-[11px] text-slate-500">
                    Entregada {fechaCorta(e.creadoEn)} por {e.entregadoPorNombre || '—'}
                    {e.fechaRespuesta && (
                      <> · {e.estado === 'CONFIRMADA' ? 'Recibida' : e.estado === 'RECHAZADA' ? 'Rechazada' : 'Cancelada'} {fechaCorta(e.fechaRespuesta)} por {e.respondidoPorNombre || '—'}</>
                    )}
                  </div>
                  {e.motivo && <div className="text-[11px] text-rose-600">Motivo: {e.motivo}</div>}
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => setAbierta(abierta === e.id ? null : e.id)}
                    aria-expanded={abierta === e.id}
                    className="px-3 py-1.5 border border-slate-200 rounded-lg font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    {abierta === e.id ? 'Ocultar' : 'Ver detalle'}
                  </button>
                  {e.estado === 'PENDIENTE' && (
                    <button
                      onClick={() => { setAviso(''); setACancelar(e) }}
                      className="px-3 py-1.5 border border-rose-200 rounded-lg font-semibold text-rose-600 hover:bg-rose-50"
                    >
                      Cancelar
                    </button>
                  )}
                </div>
              </div>
              {abierta === e.id && (
                <div className="px-3 pb-3 text-xs space-y-2">
                  {e.observacion && <p className="text-slate-600"><strong>Observación:</strong> {e.observacion}</p>}
                  <TablaEntrega entrega={e} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {nueva && (
        <ModalNuevaEntrega
          cajas={cajas}
          cajaInicial={cajaFiltro || cajas[0]?.id}
          onCerrar={() => setNueva(false)}
          onRegistrada={entrega => {
            setNueva(false)
            setAviso(`Entrega #${entrega.id} registrada para ${entrega.cajaNombre}. Queda pendiente hasta que el cajero la confirme.`)
            recargar()
          }}
        />
      )}
      {aCancelar && (
        <ModalCancelar
          entrega={aCancelar}
          onCerrar={() => setACancelar(null)}
          onCancelada={entrega => {
            setACancelar(null)
            setAviso(`Entrega #${entrega.id} cancelada.`)
            recargar()
          }}
        />
      )}
    </div>
  )
}

// ----------------------------------------------------------------------

function ModalNuevaEntrega({ cajas, cajaInicial, onCerrar, onRegistrada }: {
  cajas: Caja[]
  cajaInicial?: number
  onCerrar: () => void
  onRegistrada: (entrega: Entrega) => void
}) {
  const [cajaId, setCajaId] = useState<number>(cajaInicial ?? cajas[0].id)
  const [monedas, setMonedas] = useState<CatalogoMoneda[]>([])
  const [codigo, setCodigo] = useState('')
  const [cantidades, setCantidades] = useState<Record<number, number>>({})
  const [observacion, setObservacion] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')

  // Catálogo de billetes habilitados por moneda. La entrega es el único
  // lugar donde se registra la denominación (PI-78).
  useEffect(() => {
    listarDenominaciones()
      .then(lista => {
        setMonedas(lista)
        setCodigo(actual => actual && lista.some(m => m.codigo === actual) ? actual : lista[0]?.codigo ?? '')
      })
      .catch((e: Error) => setError(e.message))
  }, [])

  const moneda = monedas.find(m => m.codigo === codigo)
  const cajaElegida = cajas.find(c => c.id === cajaId)
  const totales = monedas
    .map(m => ({
      m,
      total: m.denominaciones.reduce((acc, d) => acc + d.valor * (cantidades[d.denominacion] ?? 0), 0),
      billetes: m.denominaciones.reduce((acc, d) => acc + (cantidades[d.denominacion] ?? 0), 0),
    }))
    .filter(t => t.billetes > 0)
  const puedeConfirmar = totales.length > 0 && !enviando

  const confirmar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!puedeConfirmar) return
    setEnviando(true)
    setError('')
    try {
      const detalle = Object.entries(cantidades)
        .filter(([, cantidad]) => cantidad > 0)
        .map(([denominacion, cantidad]) => ({ denominacion: Number(denominacion), cantidad }))
      onRegistrada(await crearEntrega(cajaId, detalle, observacion.trim()))
    } catch (err) {
      setError((err as Error).message)
      setEnviando(false)
    }
  }

  const pie = (
    <>
      <div className="space-y-1" data-testid="totales-entrega">
        {totales.length === 0 ? (
          <p className="text-slate-400">Cargá la cantidad de billetes de al menos una divisa.</p>
        ) : totales.map(t => (
          <div key={t.m.codigo} className="flex justify-between">
            <span className="text-slate-600 font-medium">Total {t.m.codigo} ({t.billetes} billetes)</span>
            <span className="font-bold font-mono text-emerald-700">{t.m.simbolo || t.m.codigo} {formatearMonto(t.total, t.m.decimales)}</span>
          </div>
        ))}
      </div>
      {error && <p role="alert" className="text-rose-600">{error}</p>}
      <BotonesModal
        onCerrar={onCerrar}
        textoConfirmar={enviando ? 'Registrando…' : 'Registrar entrega'}
        deshabilitado={!puedeConfirmar}
      />
    </>
  )

  return (
    <Modal titulo="Nueva entrega de billetes" onCerrar={onCerrar} onSubmit={confirmar} pie={pie}>
      <label className="font-semibold text-slate-600 space-y-1 block">
        <span>Caja que recibe</span>
        <select
          value={cajaId}
          onChange={e => { setCajaId(Number(e.target.value)); setCantidades({}) }}
          className="w-full p-2.5 border border-slate-200 rounded-lg bg-white"
        >
          {cajas.map(c => <option key={c.id} value={c.id}>{c.sucursal} · {c.nombre}</option>)}
        </select>
      </label>
      {cajaElegida && (
        <p className={`rounded-lg px-3 py-2 ${cajaElegida.abierta ? 'bg-sky-50 text-sky-800' : 'bg-amber-50 text-amber-800'}`}>
          {cajaElegida.abierta
            ? `La caja está abierta por ${cajaElegida.turnoActual?.cajeroNombre ?? 'un cajero'}: esta entrega es una reposición.`
            : 'La caja está cerrada: esta entrega será la apertura cuando el cajero la confirme.'}
        </p>
      )}

      <div className="flex flex-wrap gap-1.5" aria-label="Divisa">
        {monedas.map(m => {
          const cargada = totales.some(t => t.m.codigo === m.codigo)
          return (
            <button
              key={m.codigo}
              type="button"
              aria-pressed={m.codigo === codigo}
              onClick={() => setCodigo(m.codigo)}
              className={`px-3 py-1.5 rounded-lg font-bold border ${
                m.codigo === codigo ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
              }`}
            >
              {m.codigo}
              {cargada && <span className="ml-1.5 inline-block w-2 h-2 rounded-full bg-emerald-500 align-middle" aria-label="con billetes" />}
            </button>
          )
        })}
      </div>

      {moneda && (
        <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
          {moneda.denominaciones.map(d => (
            <div key={d.denominacion} className="flex items-center justify-between gap-3 px-3 py-2">
              <label htmlFor={`ent-${d.denominacion}`} className="font-semibold text-slate-700">
                Billete {textoBillete(moneda, d.valor)}
              </label>
              <CampoCantidad
                id={`ent-${d.denominacion}`}
                valor={cantidades[d.denominacion] ?? 0}
                onCambio={n => setCantidades({ ...cantidades, [d.denominacion]: n })}
              />
            </div>
          ))}
        </div>
      )}

      <label className="font-semibold text-slate-600 space-y-1 block">
        <span>Observación</span>
        <input
          type="text"
          maxLength={255}
          value={observacion}
          onChange={e => setObservacion(e.target.value)}
          placeholder="Ej. Fondo de apertura del turno mañana"
          className="w-full p-2.5 border border-slate-200 rounded-lg"
        />
      </label>
    </Modal>
  )
}

function ModalCancelar({ entrega, onCerrar, onCancelada }: {
  entrega: Entrega
  onCerrar: () => void
  onCancelada: (entrega: Entrega) => void
}) {
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')

  const confirmar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!motivo.trim()) return
    setEnviando(true)
    setError('')
    try {
      onCancelada(await cancelarEntrega(entrega.id, motivo.trim()))
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
        textoConfirmar={enviando ? 'Cancelando…' : 'Cancelar entrega'}
        textoCerrar="Volver"
        deshabilitado={enviando || !motivo.trim()}
      />
    </>
  )

  return (
    <Modal titulo={`Cancelar entrega #${entrega.id}`} onCerrar={onCerrar} onSubmit={confirmar} pie={pie}>
      <p className="text-slate-500">
        {entrega.cajaNombre} · {textoTotales(entrega)}. La entrega todavía no fue confirmada, así que no afectó el saldo.
      </p>
      <label className="font-semibold text-slate-600 space-y-1 block">
        <span>Motivo</span>
        <input
          type="text"
          maxLength={255}
          autoFocus
          value={motivo}
          onChange={e => setMotivo(e.target.value)}
          placeholder="Ej. Se cargó en la caja equivocada"
          className="w-full p-2.5 border border-slate-200 rounded-lg"
        />
      </label>
    </Modal>
  )
}
