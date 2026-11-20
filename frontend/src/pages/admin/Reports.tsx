import { useEffect, useState } from 'react'
import { listarClientes, type Cliente } from '@/services/clientes'
import { listarMonedas } from '@/services/monedas'
import { descargarReporte, TITULOS, type TipoReporte } from '@/services/reportes'
import type { Currency } from '@/types'

const descripciones: Record<TipoReporte, string> = {
  transacciones: 'Historial de operaciones y sus datos de pago y cancelación.',
  ganancias: 'Comisiones cobradas, revertidas y ganancia neta por moneda.',
  clientes: 'Buscá un cliente y descargá su actividad y operaciones.',
  tasas: 'Historial de compra y venta de la moneda seleccionada.',
  facturas: 'Historial de estados confirmados de facturas electrónicas.',
  accesos: 'Usuarios habilitados y roles de acceso a Global Exchange.',
}
const clase = 'border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white w-full'
function fechaLocal(d: Date) {
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Asuncion', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d)
  const parte = (tipo: string) => partes.find(p => p.type === tipo)?.value
  return `${parte('year')}-${parte('month')}-${parte('day')}`
}

export default function Reports() {
  const [seleccion, setSeleccion] = useState<{ tipo: TipoReporte; formato: 'pdf' | 'xlsx' } | null>(null)
  const [desde, setDesde] = useState(''), [hasta, setHasta] = useState('')
  const [estado, setEstado] = useState(''), [periodo, setPeriodo] = useState('Mes')
  const [moneda, setMoneda] = useState(''), [monedas, setMonedas] = useState<Currency[]>([])
  const [busqueda, setBusqueda] = useState(''), [clientes, setClientes] = useState<Cliente[]>([])
  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [buscando, setBuscando] = useState(false), [buscado, setBuscado] = useState(false)
  const [cargandoMonedas, setCargandoMonedas] = useState(false)
  const [descargando, setDescargando] = useState(false), [error, setError] = useState(''), [aviso, setAviso] = useState('')
  useEffect(() => {
    if (seleccion?.tipo !== 'tasas') return
    let activo = true
    setCargandoMonedas(true)
    listarMonedas().then(datos => {
      if (activo) { setMonedas(datos); setMoneda(datos.find(m => m.code === 'USD')?.code || datos[0]?.code || '') }
    }).catch(() => { if (activo) setError('No se pudieron cargar las monedas.') })
      .finally(() => { if (activo) setCargandoMonedas(false) })
    return () => { activo = false }
  }, [seleccion])
  useEffect(() => {
    if (seleccion?.tipo !== 'clientes') return
    let activo = true
    setCliente(null); setClientes([]); setBuscado(false)
    if (!busqueda.trim()) { setBuscando(false); return }
    setBuscando(true)
    const timer = window.setTimeout(() => {
      listarClientes({ buscar: busqueda.trim() }).then(datos => {
        if (activo) { setClientes(datos); setBuscado(true); setError('') }
      }).catch(() => { if (activo) setError('No se pudo buscar clientes. Intentá nuevamente.') })
        .finally(() => { if (activo) setBuscando(false) })
    }, 300)
    return () => { activo = false; window.clearTimeout(timer) }
  }, [busqueda, seleccion])
  const abrir = (tipo: TipoReporte, formato: 'pdf' | 'xlsx') => {
    setSeleccion({ tipo, formato }); setError(''); setAviso(''); setEstado(''); setPeriodo('Mes')
    setCliente(null); setBusqueda(''); setClientes([]); setBuscado(false)
    setDesde(tipo === 'ganancias' ? fechaLocal(new Date(Date.now() - 29 * 86400000)) : '')
    setHasta(tipo === 'ganancias' ? fechaLocal(new Date()) : '')
  }
  const descargar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!seleccion) return
    setDescargando(true); setError('')
    try {
      const tipo = seleccion.tipo
      await descargarReporte(tipo, seleccion.formato, {
        desde: tipo === 'accesos' || (tipo === 'tasas' && periodo !== 'Personalizado') ? undefined : desde,
        hasta: tipo === 'accesos' || (tipo === 'tasas' && periodo !== 'Personalizado') ? undefined : hasta,
        estado, cliente: cliente ? String(cliente.id) : undefined,
        moneda: tipo === 'tasas' ? moneda : undefined, periodo: tipo === 'tasas' ? periodo : undefined,
      })
      setSeleccion(null); setAviso('Reporte generado. La descarga está lista.')
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo generar el reporte.') }
    finally { setDescargando(false) }
  }
  return <div className="space-y-4">
    <h2 className="font-semibold text-xl">Reportes del sistema</h2>
    {aviso && <p role="status" className="text-emerald-700">{aviso}</p>}
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {(Object.keys(TITULOS) as TipoReporte[]).map(tipo => <section key={tipo} className="bg-white border border-slate-200 rounded-xl p-5">
        <h3 className="font-semibold mb-2">{TITULOS[tipo]}</h3>
        <p className="text-sm text-slate-500 mb-4">{descripciones[tipo]}</p>
        <div className="flex gap-2">{(['pdf', 'xlsx'] as const).map(formato => <button key={formato}
          onClick={() => abrir(tipo, formato)} aria-label={`${TITULOS[tipo]} ${formato === 'pdf' ? 'PDF' : 'Excel'}`}
          className="border rounded-lg px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50">{formato === 'pdf' ? 'PDF' : 'Excel'}</button>)}</div>
      </section>)}
    </div>
    {seleccion && <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
      <form onSubmit={descargar} role="dialog" aria-modal="true" aria-labelledby="titulo-reporte"
        className="bg-white rounded-xl p-6 w-full max-w-xl max-h-[90vh] overflow-auto space-y-4">
        <h3 id="titulo-reporte" className="text-lg font-semibold">{TITULOS[seleccion.tipo]} · {seleccion.formato === 'pdf' ? 'PDF' : 'Excel'}</h3>
        <fieldset disabled={descargando} className="space-y-4">
        {seleccion.tipo === 'clientes' && <div className="space-y-2">
          <label className="block">Buscar cliente<input className={clase} value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Nombre, documento/RUC o correo" /></label>
          {buscando && <p role="status">Buscando clientes…</p>}
          {buscado && clientes.length === 0 && <p role="status">No se encontraron clientes que coincidan con la búsqueda.</p>}
          <div className="max-h-44 overflow-auto">{clientes.map(c => <label key={c.id} className="flex gap-2 border-b p-2 text-sm">
            <input type="radio" name="cliente" checked={cliente?.id === c.id} onChange={() => setCliente(c)} />
            {c.nombre_completo || c.nombre} · {c.documento} · {c.email}
          </label>)}</div>
        </div>}
        {seleccion.tipo === 'tasas' && <>
          <label className="block">Moneda<select className={clase} value={moneda} onChange={e => setMoneda(e.target.value)} required disabled={cargandoMonedas}>
            <option value="">{cargandoMonedas ? 'Cargando monedas…' : 'Seleccionar moneda'}</option>
            {monedas.map(m => <option key={m.id} value={m.code}>{m.name} ({m.code})</option>)}
          </select></label>
          <label className="block">Período<select className={clase} value={periodo} onChange={e => setPeriodo(e.target.value)}>
            {['Hoy', 'Semana', 'Mes', 'Año', 'Personalizado'].map(p => <option key={p}>{p}</option>)}
          </select></label>
        </>}
        {seleccion.tipo !== 'accesos' && (seleccion.tipo !== 'tasas' || periodo === 'Personalizado') && <div>
          <div className="grid grid-cols-2 gap-3">
            <label>Desde<input type="date" className={clase} value={desde} onChange={e => setDesde(e.target.value)} max={hasta || undefined} /></label>
            <label>Hasta<input type="date" className={clase} value={hasta} onChange={e => setHasta(e.target.value)} min={desde || undefined} /></label>
          </div>
          <p className="text-xs text-slate-500 mt-1">Fechas inclusivas, horario de Paraguay. Dejá ambas vacías para todo el historial.</p>
        </div>}
        {['transacciones', 'clientes', 'facturas'].includes(seleccion.tipo) && <label className="block">Estado
          <select className={clase} value={estado} onChange={e => setEstado(e.target.value)}>
            <option value="">Todos</option>
            {(seleccion.tipo === 'facturas' ? ['PAGADA', 'CANCELADA', 'ANULADA', 'RECHAZADA'] : ['PENDIENTE', 'PAGADA', 'CANCELADA', 'ANULADA']).map(s => <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>)}
          </select>
        </label>}
        {seleccion.tipo === 'accesos' && <p className="text-sm text-slate-500">Se descargará el listado actual de usuarios habilitados con acceso a Global Exchange.</p>}
        {error && <p role="alert" className="text-red-600 text-sm">{error}</p>}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={() => setSeleccion(null)} className="border rounded-lg px-4 py-2">Cancelar</button>
          <button disabled={descargando || (seleccion.tipo === 'clientes' && !cliente) || (seleccion.tipo === 'tasas' && !moneda)} className="bg-emerald-700 text-white rounded-lg px-4 py-2 disabled:opacity-50">{descargando ? 'Generando…' : 'Descargar'}</button>
        </div>
        </fieldset>
      </form>
    </div>}
  </div>
}
