/**
 * Panel de alertas de tasas (PI-38, RF45/RNF27).
 *
 * Conecta con el backend real: configura par de divisas + umbral,
 * lista las alertas con editar/pausar/eliminar y muestra el
 * historial de alertas enviadas (disparos ejecutados).
 *
 * @module AlertasTasas
 */
import { useEffect, useState } from 'react'
import {
  actualizarAlerta,
  crearAlerta,
  eliminarAlerta,
  historialDisparos,
  listarAlertas,
  type AlertaTasa,
  type DireccionAlerta,
  type DisparoAlerta,
} from '@/services/alertas'
import { listarMonedas } from '@/services/monedas'

interface MonedaOpcion {
  id: number
  codigo: string
  nombre: string
}

export default function AlertasTasas() {
  const [alertas, setAlertas] = useState<AlertaTasa[]>([])
  const [monedas, setMonedas] = useState<MonedaOpcion[]>([])
  const [historial, setHistorial] = useState<DisparoAlerta[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [monedaId, setMonedaId] = useState('')
  const [direccion, setDireccion] = useState<DireccionAlerta>('supera')
  const [umbral, setUmbral] = useState('')
  const [editando, setEditando] = useState<number | null>(null)
  const [umbralEdicion, setUmbralEdicion] = useState('')

  async function recargar() {
    try {
      const [a, m, h] = await Promise.all([
        listarAlertas(),
        listarMonedas(true),
        historialDisparos(),
      ])
      setAlertas(a)
      setMonedas(m.map(x => ({ id: x.id, codigo: x.code, nombre: x.name })))
      setHistorial(h)
      setError('')
    } catch {
      setError('No se pudieron cargar las alertas.')
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    recargar()
  }, [])

  async function guardar() {
    const umbralNum = Number(umbral)
    if (!monedaId || !(umbralNum > 0)) {
      setError('Elegí la moneda y un umbral mayor a cero.')
      return
    }
    try {
      await crearAlerta(Number(monedaId), umbralNum, direccion)
      setMonedaId('')
      setUmbral('')
      await recargar()
    } catch {
      setError('No se pudo crear la alerta.')
    }
  }

  async function guardarEdicion(id: number) {
    const umbralNum = Number(umbralEdicion)
    if (!(umbralNum > 0)) {
      setError('El umbral debe ser mayor a cero.')
      return
    }
    try {
      await actualizarAlerta(id, { umbral: umbralNum })
      setEditando(null)
      await recargar()
    } catch {
      setError('No se pudo actualizar la alerta.')
    }
  }

  async function alternarPausa(alerta: AlertaTasa) {
    try {
      await actualizarAlerta(alerta.id, {
        estado: alerta.estado === 'pausada' ? 'activa' : 'pausada',
      })
      await recargar()
    } catch {
      setError('No se pudo cambiar el estado.')
    }
  }

  async function borrar(id: number) {
    try {
      await eliminarAlerta(id)
      await recargar()
    } catch {
      setError('No se pudo eliminar la alerta.')
    }
  }

  const tasaReferencia = direccion === 'supera' ? 'venta' : 'compra'

  if (cargando) {
    return <p className="text-slate-400 text-[13px]">Cargando alertas…</p>
  }

  return (
    <div className="space-y-4">
      {/* Formulario */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
        <h3 className="font-bold text-slate-900 mb-1">Configurar alerta de tasa</h3>
        <p className="text-slate-400 text-[13px] mb-4">
          Te avisamos cuando la tasa de {tasaReferencia} alcance tu objetivo.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <label className="text-[12px] font-semibold text-slate-500">
            Par de divisas
            <select
              aria-label="Par de divisas"
              value={monedaId}
              onChange={e => setMonedaId(e.target.value)}
              className="w-full mt-1 p-2 border rounded-lg text-sm font-normal"
            >
              <option value="">Elegir…</option>
              {monedas.map(m => (
                <option key={m.id} value={m.id}>{m.codigo}/PYG — {m.nombre}</option>
              ))}
            </select>
          </label>
          <label className="text-[12px] font-semibold text-slate-500">
            Condición
            <select
              aria-label="Condición"
              value={direccion}
              onChange={e => setDireccion(e.target.value as DireccionAlerta)}
              className="w-full mt-1 p-2 border rounded-lg text-sm font-normal"
            >
              <option value="supera">Alcanza o supera (venta)</option>
              <option value="baja">Baja hasta (compra)</option>
            </select>
          </label>
          <label className="text-[12px] font-semibold text-slate-500">
            Umbral objetivo
            <input
              aria-label="Umbral objetivo"
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              placeholder="Ej. 7500"
              value={umbral}
              onChange={e => setUmbral(e.target.value)}
              className="w-full mt-1 p-2 border rounded-lg text-sm font-normal"
            />
          </label>
          <div className="flex items-end">
            <button
              onClick={guardar}
              className="w-full py-2 bg-[#0f3460] text-white rounded-lg text-sm font-semibold hover:opacity-90"
            >
              Crear alerta
            </button>
          </div>
        </div>
        {error && <p className="text-red-500 text-[13px] mt-3">{error}</p>}
      </div>

      {/* Activas */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
        <h3 className="font-bold text-slate-900 mb-3">Alertas configuradas ({alertas.length})</h3>
        {alertas.length === 0 ? (
          <p className="text-slate-400 text-[13px]">Todavía no configuraste alertas.</p>
        ) : (
          <div className="space-y-2">
            {alertas.map(a => (
              <div key={a.id} className="flex items-center gap-3 flex-wrap border border-slate-100 rounded-lg p-3">
                <span className="font-bold text-slate-900 text-sm">{a.moneda_codigo}/PYG</span>
                <span className="text-[12px] text-slate-500">
                  {a.direccion === 'supera' ? '📈 supera' : '📉 baja de'} {a.umbral.toLocaleString('es-PY')}
                </span>
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${a.estado === 'activa' ? 'bg-emerald-50 text-emerald-600' : a.estado === 'pausada' ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-500'}`}>
                  {a.estado}
                </span>
                {editando === a.id ? (
                  <>
                    <input
                      aria-label="Nuevo umbral"
                      type="number"
                      inputMode="decimal"
                      step="any"
                      min="0"
                      value={umbralEdicion}
                      onChange={e => setUmbralEdicion(e.target.value)}
                      className="p-1.5 border rounded-lg text-sm w-28"
                    />
                    <button onClick={() => guardarEdicion(a.id)} className="text-[12px] font-semibold text-emerald-600">Guardar</button>
                    <button onClick={() => setEditando(null)} className="text-[12px] font-semibold text-slate-400">Cancelar</button>
                  </>
                ) : (
                  <div className="flex gap-3 ml-auto">
                    {a.estado !== 'ejecutada' && (
                      <>
                        <button
                          onClick={() => { setEditando(a.id); setUmbralEdicion(String(a.umbral)) }}
                          className="text-[12px] font-semibold text-slate-500 hover:text-slate-700"
                        >
                          Editar
                        </button>
                        <button onClick={() => alternarPausa(a)} className="text-[12px] font-semibold text-amber-600 hover:text-amber-700">
                          {a.estado === 'pausada' ? 'Reanudar' : 'Pausar'}
                        </button>
                      </>
                    )}
                    <button onClick={() => borrar(a.id)} className="text-[12px] font-semibold text-slate-400 hover:text-red-400">
                      Eliminar
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Historial */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
        <h3 className="font-bold text-slate-900 mb-3">Historial de alertas enviadas ({historial.length})</h3>
        {historial.length === 0 ? (
          <p className="text-slate-400 text-[13px]">Sin disparos todavía.</p>
        ) : (
          <div className="space-y-2">
            {historial.map(d => (
              <div key={d.id} className="flex items-center gap-3 border border-slate-100 rounded-lg p-3 text-[13px]">
                <span className="text-lg">🔔</span>
                <span className="text-slate-600">
                  <strong className="text-slate-900">{d.moneda_codigo}/PYG</strong>
                  {' '}{d.direccion === 'supera' ? 'alcanzó o superó' : 'bajó hasta'} {d.tasa_alcanzada.toLocaleString('es-PY')}
                  {' '}(umbral {d.umbral.toLocaleString('es-PY')})
                </span>
                <span className="ml-auto text-[11px] text-slate-400 whitespace-nowrap">
                  {new Date(d.creado).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
