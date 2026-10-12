/**
 * Configuración del sistema (administración) conectada a la API Django.
 *
 * - Monedas admitidas: habilita/deshabilita del catálogo (`/api/monedas/`,
 *   la gestión completa está en Monedas Admitidas).
 * - Métodos de pago: habilita/deshabilita del catálogo global (RF42).
 * - Ajustes de precio: porcentaje interno por categoría de cliente, aplicado
 *   al precio final que ve el cliente sin mostrar el desglose.
 * - Seguridad y Notificaciones: preferencias locales de la interfaz.
 *
 * @module Configuration
 */
import { useCallback, useEffect, useState } from 'react'
import { listarMonedas, cambiarEstado, definirSaldoMinimo } from '@/services/monedas'
import type { Currency } from '@/types'
import { listarMetodos, cambiarEstadoMetodo, type MetodoPago } from '@/services/metodos'
import { listarAjustesPrecio, actualizarAjustePrecio, type CategoriaCliente } from '@/services/simulador'
import {
  listarDenominaciones,
  listarDenominacionesDe,
  crearDenominacion,
  cambiarEstadoDenominacion,
  formatearMonto,
  type Denominacion,
} from '@/services/cajas'

const tabs = [
  { id: 'currencies', label: 'Monedas' },
  { id: 'payments', label: 'Métodos de pago' },
  { id: 'price-adjustments', label: 'Ajustes por categoría' },
  { id: 'security', label: 'Seguridad' },
  { id: 'notifications', label: 'Notificaciones' },
]

const categorias: CategoriaCliente[] = ['MINORISTA', 'CORPORATIVO', 'VIP']

/**
 * Alta y baja de los billetes de una moneda.
 *
 * El formulario de entregas del cajero no lista el catálogo de monedas sino
 * las monedas **que tienen billetes registrados**. Sin esto, una moneda recién
 * dada de alta desde "Monedas admitidas" no aparece en las entregas y el
 * faltante queda invisible.
 *
 * Los billetes no se borran: se desactivan, porque las entregas ya
 * registradas los referencian (`on_delete=PROTECT`).
 */
function ModalBilletes({ moneda, onCerrar, onCambio }: {
  moneda: Currency
  onCerrar: () => void
  onCambio: () => void
}) {
  const [lista, setLista] = useState<Denominacion[]>([])
  const [cargando, setCargando] = useState(true)
  const [nuevo, setNuevo] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const recargar = () =>
    listarDenominacionesDe(moneda.id)
      .then(setLista)
      .catch((e: Error) => setError(e.message))
      .finally(() => setCargando(false))

  useEffect(() => {
    void recargar()
  }, [moneda.id])

  const agregar = async (e: React.FormEvent) => {
    e.preventDefault()
    const valor = nuevo.trim().replace(',', '.')
    if (!valor) return
    const numero = Number(valor)
    if (!Number.isFinite(numero) || numero <= 0) {
      setError('El valor del billete tiene que ser un número mayor que cero.')
      return
    }
    setGuardando(true)
    setError('')
    try {
      const creada = await crearDenominacion(moneda.id, numero.toFixed(2))
      setLista(prev => [...prev, creada].sort((a, b) => b.valor - a.valor))
      setNuevo('')
      // La tabla de afuera lleva el conteo: hay que refrescarlo.
      onCambio()
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : 'No se pudo registrar el billete.')
    } finally {
      setGuardando(false)
    }
  }

  const alternar = async (d: Denominacion) => {
    setError('')
    try {
      const actualizada = await cambiarEstadoDenominacion(d.id, !d.activa)
      setLista(prev => prev.map(x => (x.id === d.id ? actualizada : x)))
      onCambio()
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : 'No se pudo actualizar el billete.')
    }
  }

  const activas = lista.filter(d => d.activa).length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        aria-label={`Billetes de ${moneda.code}`}
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md rounded-2xl bg-white shadow-xl border border-slate-100"
      >
        <header className="px-5 py-4 border-b border-slate-100">
          <h4 className="font-semibold text-slate-800 text-[15px]" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
            <span className="mr-2">{moneda.flag}</span>
            Billetes de {moneda.code}
          </h4>
          <p className="text-[12px] text-slate-400 mt-0.5">
            Se usan en las entregas de billetes y en el arqueo de cierre. Si la lista está
            vacía, la moneda no aparece en el formulario de entregas.
          </p>
        </header>

        <div className="px-5 py-4 max-h-72 overflow-y-auto">
          {cargando ? (
            <p className="text-[13px] text-slate-400 py-4 text-center">Cargando billetes…</p>
          ) : lista.length === 0 ? (
            <p className="text-[13px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-3">
              Todavía no hay billetes cargados para {moneda.code}. Agregá al menos uno para
              que la moneda pueda usarse en las entregas de efectivo.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {lista.map(d => (
                <li
                  key={d.id}
                  className={`flex items-center justify-between rounded-lg border px-3 py-2 ${
                    d.activa ? 'border-slate-100 bg-slate-50/50' : 'border-slate-100 bg-white opacity-50'
                  }`}
                >
                  <span className="font-mono text-[14px] font-semibold text-slate-800">
                    {formatearMonto(d.valor, moneda.decimals)}
                  </span>
                  <button
                    onClick={() => alternar(d)}
                    aria-label={`${d.activa ? 'Desactivar' : 'Activar'} billete de ${d.valor} ${moneda.code}`}
                    className="text-[12px] font-semibold text-slate-500 hover:text-slate-800"
                  >
                    {d.activa ? 'Desactivar' : 'Activar'}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {error && (
            <p role="alert" className="mt-3 text-[12px] text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </div>

        <form onSubmit={agregar} className="px-5 py-3 border-t border-slate-100 flex gap-2">
          <label htmlFor="nuevo-billete" className="sr-only">
            Valor del billete en {moneda.code}
          </label>
          <input
            id="nuevo-billete"
            type="text"
            inputMode="decimal"
            placeholder={`Valor en ${moneda.code} (ej. 1000)`}
            value={nuevo}
            onChange={e => setNuevo(e.target.value)}
            className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-300"
          />
          <button
            type="submit"
            disabled={guardando || !nuevo.trim()}
            className="px-4 py-2 rounded-lg text-white text-[13px] font-semibold disabled:opacity-50"
            style={{ background: '#10b981' }}
          >
            {guardando ? 'Guardando…' : 'Agregar'}
          </button>
        </form>

        <footer className="px-5 py-3 border-t border-slate-100 flex items-center justify-between">
          <span className="text-[12px] text-slate-400">{activas} billete(s) activo(s)</span>
          <button
            onClick={onCerrar}
            className="px-4 py-2 rounded-lg border border-slate-200 text-[13px] font-semibold text-slate-600 hover:bg-slate-50"
          >
            Cerrar
          </button>
        </footer>
      </div>
    </div>
  )
}

export default function Configuration() {
  const [tab, setTab] = useState('currencies')
  const [currencies, setCurrencies] = useState<Currency[]>([])
  const [paymentMethods, setPaymentMethods] = useState<MetodoPago[]>([])
  const [ajustes, setAjustes] = useState<Record<string, number>>({})
  const [ajusteForm, setAjusteForm] = useState<Record<string, string>>({})
  const [cargando, setCargando] = useState(true)
  const [aviso, setAviso] = useState('')
  const [saved, setSaved] = useState(false)

  /**
   * Cuántos billetes tiene registrados cada moneda, para poder avisar de las
   * que todavía no tienen ninguno (y por eso no salen en las entregas).
   */
  const [conBilletes, setConBilletes] = useState<Record<string, number>>({})
  const [monedaBilletes, setMonedaBilletes] = useState<Currency | null>(null)
  /**
   * PI-80: saldo mínimo de cada divisa, como texto porque mientras se
   * escribe tiene que poder quedar vacío o mal formado sin romper la
   * tabla. Se guarda al salir del campo (onBlur).
   */
  const [minimos, setMinimos] = useState<Record<number, string>>({})

  useEffect(() => {
    Promise.all([listarMonedas(), listarMetodos(), listarAjustesPrecio().catch(() => ({}))])
      .then(([ms, mps, cs]) => {
        setCurrencies(ms)
        setMinimos(Object.fromEntries(ms.map(m => [m.id, String(m.saldoMinimo ?? '0')])))
        setPaymentMethods(mps)
        setAjustes(cs)
        setAjusteForm(Object.fromEntries(Object.entries(cs).map(([k, v]) => [k, String(v)])))
      })
      .catch(() => setAviso('No se pudo cargar la configuración. Verificá que el backend esté corriendo.'))
      .finally(() => setCargando(false))
  }, [])

  /**
   * Recalcula cuántos billetes tiene cada moneda.
   *
   * Se llama al montar y también después de cada cambio en el modal de
   * billetes, así el contador de la tabla y el aviso de "faltan billetes"
   * no quedan desactualizados.
   */
  const refrescarBilletes = useCallback(() => {
    listarDenominaciones()
      .then(denoms => {
        const conteo: Record<string, number> = {}
        for (const d of denoms) {
          if (d.denominaciones.length > 0) conteo[d.codigo] = d.denominaciones.length
        }
        setConBilletes(conteo)
      })
      .catch(() => setConBilletes({}))
  }, [])

  useEffect(() => {
    refrescarBilletes()
  }, [refrescarBilletes])

  const save = () => { setSaved(true); setTimeout(() => setSaved(false), 3000) }

  const toggleMoneda = async (moneda: Currency) => {
    setCurrencies(prev => prev.map(x => (x.id === moneda.id ? { ...x, active: !x.active } : x)))
    try {
      await cambiarEstado(moneda.id, !moneda.active)
      setAviso(`${moneda.code} quedó ${!moneda.active ? 'habilitada' : 'deshabilitada'}.`)
    } catch {
      setCurrencies(prev => prev.map(x => (x.id === moneda.id ? { ...x, active: moneda.active } : x)))
      setAviso(`No se pudo cambiar el estado de ${moneda.code}.`)
    }
  }

  /**
   * Guarda el saldo mínimo de una divisa (PI-80).
   *
   * Se valida con los decimales de la moneda antes de llamar a la API: el
   * PYG no admite decimales y mandarlos ahí sería un 400 del backend.
   */
  const guardarMinimo = async (moneda: Currency) => {
    const texto = (minimos[moneda.id] ?? '0').trim().replace(',', '.')
    if (!texto) {
      setMinimos({ ...minimos, [moneda.id]: '0' })
      return
    }
    const valor = Number(texto)
    if (!Number.isFinite(valor) || valor < 0) {
      setAviso(`El saldo mínimo de ${moneda.code} tiene que ser un número mayor o igual a cero.`)
      setMinimos({ ...minimos, [moneda.id]: String(moneda.saldoMinimo ?? 0) })
      return
    }
    if (moneda.decimals === 0 && !Number.isInteger(valor)) {
      setAviso(`${moneda.code} no admite decimales en el saldo mínimo.`)
      setMinimos({ ...minimos, [moneda.id]: String(Math.round(valor)) })
      return
    }
    if (valor === Number(moneda.saldoMinimo ?? 0)) return
    try {
      const actualizada = await definirSaldoMinimo(moneda.id, String(valor))
      setCurrencies(prev => prev.map(m => (m.id === moneda.id ? actualizada : m)))
      setMinimos(prev => ({ ...prev, [moneda.id]: String(actualizada.saldoMinimo ?? '0') }))
      setAviso(
        valor > 0
          ? `El cajero verá el aviso de reposición cuando ${moneda.code} baje de ${valor}.`
          : `Se apagó el aviso de reposición para ${moneda.code}.`,
      )
    } catch (e) {
      setAviso(e instanceof Error ? e.message : `No se pudo guardar el mínimo de ${moneda.code}.`)
      setMinimos({ ...minimos, [moneda.id]: String(moneda.saldoMinimo ?? 0) })
    }
  }

  const toggleMetodo = async (metodo: MetodoPago) => {
    setPaymentMethods(prev => prev.map(x => (x.id === metodo.id ? { ...x, activo: !x.activo } : x)))
    try {
      await cambiarEstadoMetodo(metodo.id, !metodo.activo)
      setAviso(`${metodo.nombre} quedó ${!metodo.activo ? 'habilitado' : 'deshabilitado'}.`)
    } catch {
      setPaymentMethods(prev => prev.map(x => (x.id === metodo.id ? { ...x, activo: metodo.activo } : x)))
      setAviso(`No se pudo cambiar ${metodo.nombre}.`)
    }
  }

  const guardarAjuste = async (categoria: CategoriaCliente) => {
    const valor = Number((ajusteForm[categoria] ?? '').replace(',', '.'))
    if (!Number.isFinite(valor) || valor < 0 || valor > 100) {
      setAviso('El porcentaje debe estar entre 0 y 100.')
      return
    }
    try {
      await actualizarAjustePrecio(categoria, valor)
      setAjustes(prev => ({ ...prev, [categoria]: valor }))
      setAviso(`Ajuste de ${categoria.toLowerCase()} actualizado a ${valor}%.`)
    } catch (err) {
      setAviso(err instanceof Error ? err.message : 'No se pudo guardar el ajuste.')
    }
  }

  return (
    <div className="space-y-5 animate-fadein">
      {/* Tab nav */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-1.5 flex gap-1 flex-wrap">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 py-2.5 px-3 rounded-lg text-[13px] font-semibold transition-all whitespace-nowrap ${tab === t.id ? 'bg-[#0f3460] text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {aviso && (
        <div role="status" className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-[13px] text-slate-600">
          {aviso}
        </div>
      )}

      {cargando ? (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-16 text-center text-slate-400 text-[14px]">
          Cargando configuración…
        </div>
      ) : (
        <>
          {tab === 'currencies' && (
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-slate-800 text-[15px]" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Monedas admitidas</h3>
                  <p className="text-[12px] text-slate-400 mt-0.5">Activá o desactivá las monedas disponibles en la plataforma</p>
                </div>
                <button onClick={save} className="px-4 py-2 rounded-lg text-white text-[13px] font-semibold" style={{ background: '#10b981' }}>
                  {saved ? '✓ Guardado' : 'Guardar cambios'}
                </button>
              </div>
              {currencies.some(c => c.active && (conBilletes[c.code] ?? 0) === 0) && (
                <div className="px-5 py-3 bg-amber-50 border-b border-amber-100 text-[12px] text-amber-800">
                  <strong className="font-semibold">Faltan billetes.</strong>{' '}
                  {currencies
                    .filter(c => c.active && (conBilletes[c.code] ?? 0) === 0)
                    .map(c => c.code)
                    .join(', ')}{' '}
                  está activa pero no tiene billetes registrados, así que no aparece en el
                  formulario de entregas del cajero ni se puede contar en el arqueo.
                </div>
              )}
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50/60 border-b border-slate-100">
                    {['Moneda', 'Nombre', 'Decimales', 'Billetes', 'Saldo mínimo', 'Estado'].map(h => (
                      <th key={h} className="px-5 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {currencies.map(c => (
                    <tr key={c.code} className="hover:bg-slate-50/40 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <span className="text-xl">{c.flag}</span>
                          <span className="font-bold text-slate-900 text-[14px]">{c.code}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-[13px] text-slate-600">{c.name}</td>
                      <td className="px-5 py-3.5 text-[13px] font-mono text-slate-600">{c.decimals}</td>
                      <td className="px-5 py-3.5">
                        <button
                          onClick={() => setMonedaBilletes(c)}
                          aria-label={`Gestionar billetes de ${c.code}`}
                          className={`text-[12px] font-semibold px-2.5 py-1 rounded-lg border transition-colors ${
                            (conBilletes[c.code] ?? 0) > 0
                              ? 'border-slate-200 text-slate-600 hover:bg-slate-50'
                              : 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100'
                          }`}
                        >
                          {(conBilletes[c.code] ?? 0) > 0
                            ? `${conBilletes[c.code]} cargados`
                            : 'Sin billetes'}
                        </button>
                      </td>
                      <td className="px-5 py-3.5">
                        <label htmlFor={`minimo-${c.id}`} className="sr-only">
                          Saldo mínimo de {c.code}
                        </label>
                        <input
                          id={`minimo-${c.id}`}
                          type="text"
                          inputMode="decimal"
                          value={minimos[c.id] ?? '0'}
                          onChange={e => setMinimos({ ...minimos, [c.id]: e.target.value })}
                          onBlur={() => guardarMinimo(c)}
                          placeholder="0"
                          className="w-28 px-2 py-1.5 border border-slate-200 rounded-lg text-right font-mono text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-300"
                        />
                      </td>
                      <td className="px-5 py-3.5">
                        <button
                          role="switch"
                          aria-checked={c.active}
                          aria-label={`${c.active ? 'Deshabilitar' : 'Habilitar'} ${c.code}`}
                          onClick={() => toggleMoneda(c)}
                          className={`w-9 h-5 rounded-full transition-all duration-200 relative ${c.active ? 'bg-emerald-500' : 'bg-slate-200'}`}
                        >
                          <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all duration-200 ${c.active ? 'left-[calc(100%-18px)]' : 'left-0.5'}`} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'payments' && (
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
              <h3 className="font-semibold text-slate-800 text-[15px] mb-5" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Métodos de pago habilitados</h3>
              <div className="space-y-3">
                {paymentMethods.map(pm => (
                  <div key={pm.id} className="flex items-center gap-4 p-4 rounded-xl border border-slate-100 hover:bg-slate-50 transition-colors">
                    <div className="flex-1">
                      <div className="font-semibold text-slate-800 text-[14px]">{pm.nombre}</div>
                      <div className="text-[12px] text-slate-400 font-mono">{pm.codigo}</div>
                    </div>
                    <button
                      role="switch"
                      aria-checked={pm.activo}
                      aria-label={`${pm.activo ? 'Deshabilitar' : 'Habilitar'} ${pm.nombre}`}
                      onClick={() => toggleMetodo(pm)}
                      className={`w-9 h-5 rounded-full transition-all duration-200 relative ${pm.activo ? 'bg-emerald-500' : 'bg-slate-200'}`}
                    >
                      <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all duration-200 ${pm.activo ? 'left-[calc(100%-18px)]' : 'left-0.5'}`} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'price-adjustments' && (
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
              <h3 className="font-semibold text-slate-800 text-[15px] mb-1" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Ajustes de precio por categoría</h3>
              <p className="text-[12px] text-slate-400 mb-5">Configuración interna. El ajuste se incorpora al precio final y no se muestra como una línea separada al cliente.</p>
              <div className="space-y-3">
                {categorias.map(cat => (
                  <div key={cat} className="flex items-center gap-4 p-4 rounded-xl border border-slate-100">
                    <div className="flex-1">
                      <div className="font-semibold text-slate-800 text-[14px] capitalize">{cat.toLowerCase()}</div>
                      <div className="text-[12px] text-slate-400">Actual: {ajustes[cat] ?? '—'}%</div>
                    </div>
                    <label htmlFor={`ajuste-${cat}`} className="sr-only">Porcentaje {cat}</label>
                    <input
                      id={`ajuste-${cat}`}
                      type="number"
                      min={0}
                      max={100}
                      step={0.01}
                      value={ajusteForm[cat] ?? ''}
                      onChange={e => setAjusteForm(prev => ({ ...prev, [cat]: e.target.value }))}
                      className="w-28 border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-300"
                    />
                    <span className="text-slate-400 text-sm">%</span>
                    <button onClick={() => guardarAjuste(cat)} className="px-4 py-2 rounded-lg text-white text-[13px] font-semibold" style={{ background: '#10b981' }}>
                      Guardar
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'security' && (
            <div className="space-y-4">
              {[
                { title: 'Autenticación de dos factores (2FA)', desc: 'Requiere verificación adicional al iniciar sesión', active: true },
                { title: 'Bloqueo automático de sesión', desc: 'Cierra sesión automáticamente tras 30 minutos de inactividad', active: true },
                { title: 'Alertas de inicio de sesión sospechoso', desc: 'Notifica cuando se detecta acceso desde dispositivo desconocido', active: true },
                { title: 'Límite de intentos de acceso', desc: 'Bloquea la cuenta tras 5 intentos fallidos', active: false },
              ].map((s, i) => (
                <div key={i} className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 flex items-center justify-between gap-4">
                  <div>
                    <div className="font-semibold text-slate-800 text-[14px]" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>{s.title}</div>
                    <div className="text-[13px] text-slate-400 mt-0.5">{s.desc}</div>
                  </div>
                  <button className={`w-9 h-5 rounded-full transition-all duration-200 relative shrink-0 ${s.active ? 'bg-emerald-500' : 'bg-slate-200'}`}>
                    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all duration-200 ${s.active ? 'left-[calc(100%-18px)]' : 'left-0.5'}`} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {tab === 'notifications' && (
            <div className="space-y-4">
              {[
                { group: 'Operaciones', items: ['Compra de divisas confirmada', 'Venta de divisas confirmada', 'Transferencia realizada', 'Operación pendiente de confirmación'] },
                { group: 'Tasas', items: ['Variación mayor al 1% en cualquier divisa', 'Actualización manual de tasas por analista', 'Tasas fuera del horario habitual'] },
                { group: 'Sistema', items: ['Nuevas facturas electrónicas', 'Alertas de seguridad', 'Mantenimiento programado del sistema'] },
              ].map(section => (
                <div key={section.group} className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
                  <h4 className="font-semibold text-slate-700 text-[13px] uppercase tracking-wider mb-4">{section.group}</h4>
                  <div className="space-y-3">
                    {section.items.map((item, i) => (
                      <div key={i} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                        <span className="text-[14px] text-slate-700">{item}</span>
                        <div className="flex items-center gap-4">
                          {['App', 'Email'].map(channel => (
                            <label key={channel} className="flex items-center gap-1.5 cursor-pointer">
                              <input type="checkbox" defaultChecked={i < 2} className="w-3.5 h-3.5 accent-emerald-500" />
                              <span className="text-[11px] text-slate-400 font-medium">{channel}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <button onClick={save} className="px-6 py-2.5 rounded-xl text-white text-[13px] font-semibold" style={{ background: '#10b981' }}>
                {saved ? '✓ Guardado' : 'Guardar preferencias'}
              </button>
            </div>
          )}
        </>
      )}

      {monedaBilletes && (
        <ModalBilletes
          moneda={monedaBilletes}
          onCerrar={() => setMonedaBilletes(null)}
          onCambio={refrescarBilletes}
        />
      )}
    </div>
  )
}
