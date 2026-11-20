import { useEffect, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { listarMonedas } from '@/services/monedas'
import { formatoImporte, obtenerGanancias, type Agrupacion, type FiltrosGanancias, type Ganancias } from '@/services/ganancias'
import { exportarGanancias } from '@/services/exportarGanancias'

const inicial: FiltrosGanancias = { desde: '', hasta: '', moneda: '', agrupar: 'dia' }
const campo = 'rounded-lg border border-slate-200 px-3 py-2 text-sm'
const tarjeta = 'rounded-xl border border-slate-100 bg-white p-5'
const pyg = (monto: number) => `${formatoImporte(monto)} PYG`

export default function Earnings({ reporte = false }: { reporte?: boolean }) {
  const [filtros, setFiltros] = useState(inicial)
  const [aplicados, setAplicados] = useState(inicial)
  const [monedas, setMonedas] = useState<string[]>([])
  const [datos, setDatos] = useState<Ganancias | null>(null)
  const [error, setError] = useState('')
  const [errorExportacion, setErrorExportacion] = useState('')
  const [exportando, setExportando] = useState(false)

  useEffect(() => {
    let activo = true
    listarMonedas()
      .then(lista => { if (activo) setMonedas(lista.map(m => m.code)) })
      .catch(() => {})
    return () => { activo = false }
  }, [])

  useEffect(() => {
    const control = new AbortController()
    obtenerGanancias(aplicados, reporte, control.signal)
      .then(resultado => { if (!control.signal.aborted) setDatos(resultado) })
      .catch(e => { if (!control.signal.aborted) setError(e.message || 'No se pudieron cargar las ganancias.') })
    return () => control.abort()
  }, [aplicados, reporte])

  async function descargar(formato: 'pdf' | 'xlsx') {
    if (!datos) return
    setExportando(true)
    setErrorExportacion('')
    try {
      await exportarGanancias(formato, datos, aplicados)
    } catch {
      setErrorExportacion('No se pudo descargar el reporte.')
    } finally {
      setExportando(false)
    }
  }

  const codigos = [...new Set(['PYG', ...monedas, ...(datos?.por_moneda.map(m => m.moneda) ?? []), filtros.moneda])]
    .filter(Boolean).sort()

  return (
    <div className="space-y-5">
      <form className={`${tarjeta} flex flex-wrap items-end gap-4`} onSubmit={evento => {
        evento.preventDefault()
        setDatos(null)
        setError('')
        setErrorExportacion('')
        setAplicados({ ...filtros })
      }}>
        <label className="grid gap-1 text-sm">Desde
          <input type="date" className={campo} value={filtros.desde} max={filtros.hasta || undefined}
            onChange={e => setFiltros({ ...filtros, desde: e.target.value })} />
        </label>
        <label className="grid gap-1 text-sm">Hasta
          <input type="date" className={campo} value={filtros.hasta} min={filtros.desde || undefined}
            onChange={e => setFiltros({ ...filtros, hasta: e.target.value })} />
        </label>
        <label className="grid gap-1 text-sm">Moneda de la comisión
          <select className={campo} value={filtros.moneda} onChange={e => setFiltros({ ...filtros, moneda: e.target.value })}>
            <option value="">Todas</option>
            {codigos.map(codigo => <option key={codigo}>{codigo}</option>)}
          </select>
        </label>
        {reporte && <label className="grid gap-1 text-sm">Agrupar por
          <select className={campo} value={filtros.agrupar} onChange={e => setFiltros({ ...filtros, agrupar: e.target.value as Agrupacion })}>
            <option value="dia">Día</option><option value="mes">Mes</option><option value="moneda">Moneda</option>
          </select>
        </label>}
        <button className="rounded-lg bg-[#0f3460] px-4 py-2 text-sm font-semibold text-white">Aplicar filtros</button>
      </form>

      {error && <p role="alert" className={tarjeta}>{error}</p>}
      {!error && !datos && <p role="status" className={tarjeta}>Cargando ganancias…</p>}
      {datos?.operaciones === 0 && <p className={tarjeta}>No hay operaciones pagadas para estos filtros.</p>}
      {datos && datos.operaciones > 0 && (
        <>
          <section className={tarjeta}>
            <h2 className="font-semibold">Ganancia total</h2>
            <p className="mt-2 text-2xl font-bold">{pyg(datos.total_pyg)}</p>
            <p className="text-sm text-slate-500">{datos.operaciones} operaciones pagadas</p>
            {datos.operaciones_sin_tasa > 0 && (
              <p className="mt-2 text-sm text-amber-800">{datos.operaciones_sin_tasa} operaciones carecen de tasa histórica para convertir a PYG.</p>
            )}
          </section>
          {reporte ? (
            <section className={`${tarjeta} overflow-x-auto`}>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-semibold">Reporte de ganancias</h2>
                <div className="flex gap-2">
                  <button type="button" className={campo} disabled={exportando} onClick={() => void descargar('pdf')}>Descargar PDF</button>
                  <button type="button" className={campo} disabled={exportando} onClick={() => void descargar('xlsx')}>Descargar Excel</button>
                </div>
              </div>
              {errorExportacion && <p role="alert" className="text-sm text-red-600">{errorExportacion}</p>}
              <table className="w-full text-left text-sm">
                <thead><tr>{['Período', 'Moneda', 'Operaciones', 'Volumen', 'Comisión', 'Equivalente en PYG'].map(t => <th key={t} className="p-2">{t}</th>)}</tr></thead>
                <tbody>{datos.filas.map(f => (
                  <tr key={`${f.periodo}-${f.moneda}`} className="border-t border-slate-100">
                    <td className="p-2">{f.periodo}</td><td className="p-2">{f.moneda}</td><td className="p-2">{f.operaciones}</td>
                    <td className="p-2">{formatoImporte(f.volumen)}</td><td className="p-2">{formatoImporte(f.comision)}</td><td className="p-2">{pyg(f.equivalente_pyg)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </section>
          ) : (
            <div className="grid gap-5 lg:grid-cols-2">
              <section className={tarjeta}>
                <h2 className="mb-3 font-semibold">Ganancia por moneda</h2>
                <ul className="divide-y divide-slate-100">
                  {datos.por_moneda.map(m => (
                    <li key={m.moneda} className="flex justify-between gap-3 py-2 text-sm">
                      <span>{formatoImporte(m.comision)} {m.moneda}</span><strong>{pyg(m.equivalente_pyg)}</strong>
                    </li>
                  ))}
                </ul>
              </section>
              <section className={tarjeta}>
                <h2 className="mb-3 font-semibold">Evolución mensual</h2>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={datos.por_mes}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="mes" />
                    <YAxis width={84} tickFormatter={formatoImporte} />
                    <Tooltip formatter={valor => pyg(Number(valor))} />
                    <Bar dataKey="total_pyg" name="Ganancia" fill="#0f766e" />
                  </BarChart>
                </ResponsiveContainer>
              </section>
            </div>
          )}
        </>
      )}
    </div>
  )
}
