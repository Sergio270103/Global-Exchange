/**
 * Vista de administración de monedas admitidas.
 *
 * Permite al administrador gestionar el catálogo de divisas con las que
 * opera la casa de cambios: listarlas, registrar una nueva, editar sus
 * datos y habilitarlas o deshabilitarlas.
 *
 * La baja es lógica: una moneda deshabilitada deja de ofrecerse a los
 * clientes pero conserva su histórico de tasas y transacciones. Solo el
 * rol `admin` puede acceder a esta pantalla.
 *
 * Cada tarjeta muestra la cotización vigente (compra/venta) o un aviso
 * de "Sin cotización" (el guaraní, moneda base, muestra "Moneda base" y
 * no admite tasa). Desde acá mismo se registra la tasa actual de
 * cualquier moneda, tenga o no historial previo (PI-71).
 *
 * @module admin/Currencies
 */
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  actualizarMoneda,
  banderaDesdeCodigo,
  cambiarEstado,
  crearMoneda,
  listarMonedas,
  type DatosMoneda,
} from '@/services/monedas'
import { vigentes, crearCotizacion, type Cotizacion } from '@/services/cotizaciones'
import type { AuthUser, Currency } from '@/types'

/** Valores iniciales del formulario de moneda. */
const emptyForm = {
  code: '',
  name: '',
  symbol: '',
  decimals: '2',
}

/** Filtros disponibles sobre el estado de las monedas. */
type Filtro = 'todas' | 'activas' | 'inactivas'

/**
 * Valida el formulario y devuelve los errores por campo (vacío si es válido).
 *
 * @param form - Valores actuales del formulario.
 * @returns Un objeto con el mensaje de error de cada campo inválido.
 */
function validateForm(form: typeof emptyForm): Record<string, string> {
  const errors: Record<string, string> = {}
  if (!/^[A-Za-z]{3}$/.test(form.code.trim())) {
    errors.code = 'El código debe tener 3 letras (ISO 4217). Ej.: USD'
  }
  if (form.name.trim().length < 3) {
    errors.name = 'El nombre es obligatorio (mínimo 3 caracteres)'
  }
  if (!form.symbol.trim()) {
    errors.symbol = 'El símbolo es obligatorio'
  }
  const decimals = Number(form.decimals)
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 8) {
    errors.decimals = 'Los decimales deben ser un número entero entre 0 y 8'
  }
  return errors
}

const inputClass = 'w-full border border-slate-200 rounded-xl px-4 py-2.5 text-[14px] text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300'
const labelClass = 'block text-[12px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5'

export default function Currencies({ auth }: { auth: AuthUser }) {
  const [monedas, setMonedas] = useState<Currency[]>([])
  const [vigentesMap, setVigentesMap] = useState<Record<string, Cotizacion>>({})
  const [cargando, setCargando] = useState(true)
  const [aviso, setAviso] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('todas')
  const [busqueda, setBusqueda] = useState('')

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [guardando, setGuardando] = useState(false)
  const [confirmId, setConfirmId] = useState<number | null>(null)

  // PI-71: registro de la tasa actual por moneda.
  const [tasaTarget, setTasaTarget] = useState<Currency | null>(null)
  const [tasaCompra, setTasaCompra] = useState('')
  const [tasaVenta, setTasaVenta] = useState('')
  const [tasaError, setTasaError] = useState('')
  const [tasaGuardando, setTasaGuardando] = useState(false)

  useEffect(() => {
    Promise.all([listarMonedas(), vigentes().catch(() => [] as Cotizacion[])])
      .then(([ms, vs]) => {
        setMonedas(ms)
        setVigentesMap(Object.fromEntries(vs.map(v => [v.moneda, v])))
      })
      .catch(() => setAviso('No se pudieron cargar las monedas. Recargá la página.'))
      .finally(() => setCargando(false))
  }, [])

  const set = (field: keyof typeof emptyForm, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }))
    setErrors(prev => {
      if (!prev[field]) return prev
      const next = { ...prev }
      delete next[field]
      return next
    })
  }

  const openCreate = () => {
    setForm(emptyForm)
    setErrors({})
    setAviso('')
    setEditingId(null)
    setShowForm(true)
  }

  const openEdit = (moneda: Currency) => {
    setForm({
      code: moneda.code,
      name: moneda.name,
      symbol: moneda.symbol,
      decimals: String(moneda.decimals),
    })
    setErrors({})
    setAviso('')
    setEditingId(moneda.id)
    setShowForm(true)
  }

  const handleSubmit = async () => {
    const validation = validateForm(form)
    setErrors(validation)
    if (Object.keys(validation).length > 0) return

    const datos: DatosMoneda = {
      code: form.code.trim().toUpperCase(),
      name: form.name.trim(),
      symbol: form.symbol.trim(),
      flag: banderaDesdeCodigo(form.code),
      decimals: Number(form.decimals),
    }

    setGuardando(true)
    try {
      if (editingId !== null) {
        const actualizada = await actualizarMoneda(editingId, datos)
        setMonedas(prev => prev.map(m => (m.id === editingId ? actualizada : m)))
        setAviso(`Se guardaron los cambios de ${actualizada.code}.`)
      } else {
        const creada = await crearMoneda(datos)
        setMonedas(prev => [...prev, creada].sort((a, b) => a.code.localeCompare(b.code)))
        setAviso(`${creada.code} quedó registrada y habilitada.`)
      }
      setShowForm(false)
    } catch (error) {
      setErrors({ code: error instanceof Error ? error.message : 'No se pudo guardar la moneda.' })
    } finally {
      setGuardando(false)
    }
  }

  const aplicarEstado = async (moneda: Currency, active: boolean) => {
    // Actualización optimista: se revierte si el servicio falla.
    setMonedas(prev => prev.map(m => (m.id === moneda.id ? { ...m, active } : m)))
    try {
      await cambiarEstado(moneda.id, active)
      setAviso(`${moneda.code} quedó ${active ? 'habilitada' : 'deshabilitada'}.`)
    } catch {
      setMonedas(prev => prev.map(m => (m.id === moneda.id ? { ...m, active: !active } : m)))
      setAviso(`No se pudo cambiar el estado de ${moneda.code}.`)
    }
    setConfirmId(null)
  }

  /** Al deshabilitar se pide confirmación; al habilitar se aplica directo. */
  const handleToggle = (moneda: Currency) => {
    if (moneda.active) setConfirmId(moneda.id)
    else aplicarEstado(moneda, true)
  }

  const openTasa = (moneda: Currency) => {
    const vigente = vigentesMap[moneda.code]
    setTasaTarget(moneda)
    setTasaCompra(vigente ? String(vigente.compra) : '')
    setTasaVenta(vigente ? String(vigente.venta) : '')
    setTasaError('')
    setAviso('')
  }

  const guardarTasa = async () => {
    if (!tasaTarget) return
    const compra = Number(tasaCompra)
    const venta = Number(tasaVenta)
    if (!compra || !venta) {
      setTasaError('Cargá compra y venta en guaraníes.')
      return
    }
    if (venta < compra) {
      setTasaError('La venta no puede ser menor que la compra.')
      return
    }
    setTasaGuardando(true)
    try {
      const nueva = await crearCotizacion(tasaTarget.id, compra, venta)
      setVigentesMap(prev => ({ ...prev, [nueva.moneda]: nueva }))
      setAviso(`Tasa de ${nueva.moneda} registrada: C ₲${nueva.compra.toLocaleString()} / V ₲${nueva.venta.toLocaleString()}.`)
      setTasaTarget(null)
    } catch (err) {
      setTasaError(err instanceof Error ? err.message : 'No se pudo registrar la tasa.')
    } finally {
      setTasaGuardando(false)
    }
  }

  if (auth.role !== 'admin') {
    return (
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-16 text-center">
        <h3 className="font-bold text-slate-900 text-xl mb-2" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Sección restringida</h3>
        <p className="text-slate-400 text-[14px]">La administración de monedas está disponible solo para el rol administrador.</p>
      </div>
    )
  }

  const visibles = monedas
    .filter(m => (filtro === 'activas' ? m.active : filtro === 'inactivas' ? !m.active : true))
    .filter(m => {
      const texto = busqueda.trim().toLowerCase()
      return !texto || m.code.toLowerCase().includes(texto) || m.name.toLowerCase().includes(texto)
    })

  const activas = monedas.filter(m => m.active).length
  const confirmTarget = confirmId !== null ? monedas.find(m => m.id === confirmId) : undefined

  return (
    <div className="space-y-5 animate-fadein">
      {/* Encabezado */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="font-semibold text-slate-800 text-[15px]" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Monedas admitidas</h3>
          <p className="text-[12px] text-slate-400 mt-0.5">
            {cargando ? 'Cargando…' : `${activas} de ${monedas.length} habilitadas`}
          </p>
        </div>
        <button onClick={openCreate} className="px-4 py-2 rounded-lg text-white text-[13px] font-semibold transition-all hover:opacity-90" style={{ background: '#0f3460' }}>
          + Nueva moneda
        </button>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 flex flex-wrap items-center gap-3">
        <label htmlFor="currency-search" className="sr-only">Buscar moneda</label>
        <input
          id="currency-search"
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar por código o nombre…"
          className={`${inputClass} flex-1 min-w-[220px]`}
        />
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
          {(['todas', 'activas', 'inactivas'] as Filtro[]).map(opcion => (
            <button
              key={opcion}
              onClick={() => setFiltro(opcion)}
              aria-pressed={filtro === opcion}
              className={`px-3 py-1.5 rounded-lg text-[13px] font-semibold capitalize transition-colors ${filtro === opcion ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              {opcion}
            </button>
          ))}
        </div>
      </div>

      {aviso && (
        <div role="status" className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-[13px] text-slate-600">
          {aviso}
        </div>
      )}

      {/* Listado */}
      {cargando ? (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-16 text-center text-slate-400 text-[14px]">
          Cargando monedas…
        </div>
      ) : visibles.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-16 text-center">
          <div className="text-5xl mb-4">💱</div>
          <h3 className="font-bold text-slate-900 text-xl mb-2" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
            {monedas.length === 0 ? 'Sin monedas registradas' : 'Ninguna moneda coincide'}
          </h3>
          <p className="text-slate-400 text-[14px] mb-6">
            {monedas.length === 0
              ? 'Registrá la primera divisa con la que va a operar la casa de cambios'
              : 'Probá con otro código, otro nombre u otro filtro'}
          </p>
          {monedas.length === 0 && (
            <button onClick={openCreate} className="px-4 py-2 rounded-lg text-white text-[13px] font-semibold transition-all hover:opacity-90" style={{ background: '#0f3460' }}>
              + Nueva moneda
            </button>
          )}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibles.map(moneda => {
            const vigente = vigentesMap[moneda.code]
            return (
              <div key={moneda.id} data-testid={`moneda-${moneda.code}`} className={`bg-white rounded-xl border shadow-sm p-5 flex items-center gap-4 ${moneda.active ? 'border-slate-100' : 'border-slate-200 bg-slate-50/60'}`}>
                <span className={`text-3xl shrink-0 ${moneda.active ? '' : 'grayscale opacity-60'}`}>{moneda.flag}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-slate-900 text-[15px]">{moneda.code}</div>
                  <div className="text-[12px] text-slate-400 truncate">{moneda.name}</div>
                  <div className="text-[12px] text-slate-400">
                    {moneda.symbol} · {moneda.decimals === 0 ? 'sin decimales' : `${moneda.decimals} decimales`}
                  </div>
                  {moneda.code === 'PYG' ? (
                    <div className="mt-1">
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">Moneda base</span>
                    </div>
                  ) : vigente ? (
                    <div className="text-[12px] font-mono font-semibold text-emerald-700 mt-1">
                      C ₲{vigente.compra.toLocaleString()} · V ₲{vigente.venta.toLocaleString()}
                    </div>
                  ) : (
                    <div className="mt-1">
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">Sin cotización</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {moneda.code !== 'PYG' && (
                    <button
                      onClick={() => openTasa(moneda)}
                      aria-label={`Registrar tasa de ${moneda.code}`}
                      title={vigente ? 'Actualizar tasa (crea un punto nuevo en el historial)' : 'Registrar primera tasa'}
                      className="h-8 px-2 rounded-lg text-emerald-600 hover:bg-emerald-50 transition-colors text-[13px] font-bold"
                    >
                      ₲+
                    </button>
                  )}
                  <button
                    onClick={() => openEdit(moneda)}
                    aria-label={`Editar ${moneda.code}`}
                    title="Editar"
                    className="w-8 h-8 rounded-lg text-slate-400 hover:text-[#0f3460] hover:bg-slate-100 transition-colors text-[15px]"
                  >
                    ✎
                  </button>
                  <button
                    role="switch"
                    aria-checked={moneda.active}
                    aria-label={`${moneda.active ? 'Deshabilitar' : 'Habilitar'} ${moneda.code}`}
                    onClick={() => handleToggle(moneda)}
                    className={`w-11 h-6 rounded-full relative transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-300 ${moneda.active ? 'bg-emerald-500' : 'bg-slate-300'}`}
                  >
                    <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all ${moneda.active ? 'right-0.5' : 'left-0.5'}`} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal de tasa por moneda (PI-71) */}
      {tasaTarget && createPortal((
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setTasaTarget(null)}>
          <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md animate-fadein" onClick={e => e.stopPropagation()}>
            <h2 className="font-bold text-slate-900 text-lg mb-1" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
              Registrar tasa — {tasaTarget.code}
            </h2>
            <p className="text-slate-400 text-[13px] mb-6">
              {vigentesMap[tasaTarget.code]
                ? 'Se agrega un punto nuevo al historial con tu usuario y la fecha.'
                : 'Es su primera cotización: con esto la moneda empieza a operar.'}
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="tasa-compra" className={labelClass}>Compra (₲)</label>
                <input id="tasa-compra" type="number" min={0} value={tasaCompra} onChange={e => setTasaCompra(e.target.value)} placeholder="7400" className={`${inputClass} font-mono`} />
              </div>
              <div>
                <label htmlFor="tasa-venta" className={labelClass}>Venta (₲)</label>
                <input id="tasa-venta" type="number" min={0} value={tasaVenta} onChange={e => setTasaVenta(e.target.value)} placeholder="7500" className={`${inputClass} font-mono`} />
              </div>
            </div>
            {tasaError && <p role="alert" className="text-red-500 text-[12px] mt-3">{tasaError}</p>}
            <div className="flex gap-3 mt-6">
              <button onClick={() => setTasaTarget(null)} className="flex-1 py-3 rounded-xl border border-slate-200 text-[14px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
                Cancelar
              </button>
              <button onClick={guardarTasa} disabled={tasaGuardando} className="flex-1 py-3 rounded-xl text-white text-[14px] font-semibold transition-all hover:-translate-y-0.5 disabled:opacity-60 disabled:hover:translate-y-0" style={{ background: '#0f3460' }}>
                {tasaGuardando ? 'Guardando…' : 'Guardar tasa'}
              </button>
            </div>
          </div>
        </div>
      ), document.body)}

      {/* Modal de alta / edición */}
      {showForm && createPortal((
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-lg animate-fadein max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h2 className="font-bold text-slate-900 text-lg mb-6" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
              {editingId !== null ? 'Editar moneda' : 'Nueva moneda'}
            </h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="currency-code" className={labelClass}>Código ISO</label>
                <input id="currency-code" value={form.code} onChange={e => set('code', e.target.value.toUpperCase())} maxLength={3} placeholder="USD" className={`${inputClass} font-mono uppercase`} />
                {errors.code && <p className="text-red-500 text-[12px] mt-1">{errors.code}</p>}
              </div>
              <div>
                <label htmlFor="currency-name" className={labelClass}>Nombre</label>
                <input id="currency-name" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Dólar Americano" className={inputClass} />
                {errors.name && <p className="text-red-500 text-[12px] mt-1">{errors.name}</p>}
              </div>
              <div>
                <label htmlFor="currency-symbol" className={labelClass}>Símbolo</label>
                <input id="currency-symbol" value={form.symbol} onChange={e => set('symbol', e.target.value)} maxLength={8} placeholder="$" className={inputClass} />
                {errors.symbol && <p className="text-red-500 text-[12px] mt-1">{errors.symbol}</p>}
              </div>
              <div>
                <label htmlFor="currency-decimals" className={labelClass}>Decimales</label>
                <input id="currency-decimals" type="number" min={0} max={8} value={form.decimals} onChange={e => set('decimals', e.target.value)} className={inputClass} />
                {errors.decimals && <p className="text-red-500 text-[12px] mt-1">{errors.decimals}</p>}
                <p className="text-[12px] text-slate-400 mt-1">El guaraní usa 0; la mayoría de las divisas usa 2.</p>
              </div>
              <div className="sm:col-span-2 flex items-center gap-3 rounded-xl bg-slate-50 border border-slate-100 px-4 py-3">
                <span className="text-2xl">{banderaDesdeCodigo(form.code)}</span>
                <p className="text-[12px] text-slate-500">La bandera se deriva de las dos primeras letras del código.</p>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowForm(false)} className="flex-1 py-3 rounded-xl border border-slate-200 text-[14px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
                Cancelar
              </button>
              <button onClick={handleSubmit} disabled={guardando} className="flex-1 py-3 rounded-xl text-white text-[14px] font-semibold transition-all hover:-translate-y-0.5 disabled:opacity-60 disabled:hover:translate-y-0" style={{ background: '#0f3460' }}>
                {guardando ? 'Guardando…' : editingId !== null ? 'Guardar cambios' : 'Registrar moneda'}
              </button>
            </div>
          </div>
        </div>
      ), document.body)}

      {/* Confirmación de baja */}
      {confirmTarget && createPortal((
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setConfirmId(null)}>
          <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md animate-fadein" onClick={e => e.stopPropagation()}>
            <h2 className="font-bold text-slate-900 text-lg mb-2" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Deshabilitar moneda</h2>
            <p className="text-slate-500 text-[14px] mb-6">
              {confirmTarget.code} deja de ofrecerse a los clientes y no se puede usar en nuevas operaciones. Las tasas y transacciones anteriores se conservan, y podés volver a habilitarla cuando quieras.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmId(null)} className="flex-1 py-3 rounded-xl border border-slate-200 text-[14px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
                Cancelar
              </button>
              <button onClick={() => aplicarEstado(confirmTarget, false)} className="flex-1 py-3 rounded-xl text-white text-[14px] font-semibold bg-red-500 hover:bg-red-600 transition-colors">
                Deshabilitar
              </button>
            </div>
          </div>
        </div>
      ), document.body)}
    </div>
  )
}
