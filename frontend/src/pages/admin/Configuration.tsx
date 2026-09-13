/**
 * Configuración del sistema (administración) conectada a la API Django.
 *
 * - Monedas admitidas: habilita/deshabilita del catálogo (`/api/monedas/`,
 *   la gestión completa está en Monedas Admitidas).
 * - Métodos de pago: habilita/deshabilita del catálogo global (RF42).
 * - Comisiones: porcentaje por categoría de cliente (Hito 4), usado por
 *   el simulador y las operaciones.
 * - Seguridad y Notificaciones: preferencias locales de la interfaz.
 *
 * @module Configuration
 */
import { useEffect, useState } from 'react'
import { listarMonedas, cambiarEstado } from '@/services/monedas'
import type { Currency } from '@/types'
import { listarMetodos, cambiarEstadoMetodo, type MetodoPago } from '@/services/metodos'
import { listarComisiones, actualizarComision, type CategoriaCliente } from '@/services/simulador'

const tabs = [
  { id: 'currencies', label: 'Monedas' },
  { id: 'payments', label: 'Métodos de pago' },
  { id: 'commissions', label: 'Comisiones' },
  { id: 'security', label: 'Seguridad' },
  { id: 'notifications', label: 'Notificaciones' },
]

const categorias: CategoriaCliente[] = ['MINORISTA', 'CORPORATIVO', 'VIP']

export default function Configuration() {
  const [tab, setTab] = useState('currencies')
  const [currencies, setCurrencies] = useState<Currency[]>([])
  const [paymentMethods, setPaymentMethods] = useState<MetodoPago[]>([])
  const [comisiones, setComisiones] = useState<Record<string, number>>({})
  const [comisionForm, setComisionForm] = useState<Record<string, string>>({})
  const [cargando, setCargando] = useState(true)
  const [aviso, setAviso] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    Promise.all([listarMonedas(), listarMetodos(), listarComisiones().catch(() => ({}))])
      .then(([ms, mps, cs]) => {
        setCurrencies(ms)
        setPaymentMethods(mps)
        setComisiones(cs)
        setComisionForm(Object.fromEntries(Object.entries(cs).map(([k, v]) => [k, String(v)])))
      })
      .catch(() => setAviso('No se pudo cargar la configuración. Verificá que el backend esté corriendo.'))
      .finally(() => setCargando(false))
  }, [])

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

  const guardarComision = async (categoria: CategoriaCliente) => {
    const valor = Number((comisionForm[categoria] ?? '').replace(',', '.'))
    if (!Number.isFinite(valor) || valor < 0 || valor > 100) {
      setAviso('El porcentaje debe estar entre 0 y 100.')
      return
    }
    try {
      await actualizarComision(categoria, valor)
      setComisiones(prev => ({ ...prev, [categoria]: valor }))
      setAviso(`Comisión ${categoria.toLowerCase()} actualizada a ${valor}%.`)
    } catch (err) {
      setAviso(err instanceof Error ? err.message : 'No se pudo guardar la comisión.')
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
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50/60 border-b border-slate-100">
                    {['Moneda', 'Nombre', 'Decimales', 'Estado'].map(h => (
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

          {tab === 'commissions' && (
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
              <h3 className="font-semibold text-slate-800 text-[15px] mb-1" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Comisiones por categoría de cliente</h3>
              <p className="text-[12px] text-slate-400 mb-5">Porcentaje aplicado sobre el monto convertido en el simulador y las operaciones.</p>
              <div className="space-y-3">
                {categorias.map(cat => (
                  <div key={cat} className="flex items-center gap-4 p-4 rounded-xl border border-slate-100">
                    <div className="flex-1">
                      <div className="font-semibold text-slate-800 text-[14px] capitalize">{cat.toLowerCase()}</div>
                      <div className="text-[12px] text-slate-400">Actual: {comisiones[cat] ?? '—'}%</div>
                    </div>
                    <label htmlFor={`comision-${cat}`} className="sr-only">Porcentaje {cat}</label>
                    <input
                      id={`comision-${cat}`}
                      type="number"
                      min={0}
                      max={100}
                      step={0.01}
                      value={comisionForm[cat] ?? ''}
                      onChange={e => setComisionForm(prev => ({ ...prev, [cat]: e.target.value }))}
                      className="w-28 border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-300"
                    />
                    <span className="text-slate-400 text-sm">%</span>
                    <button onClick={() => guardarComision(cat)} className="px-4 py-2 rounded-lg text-white text-[13px] font-semibold" style={{ background: '#10b981' }}>
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
    </div>
  )
}
