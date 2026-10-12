/**
 * Dashboard del rol administrador.
 *
 * Vista agregada de todo el negocio (solo operaciones PAGADA):
 * volumen bruto operado en guaraníes, conteo histórico con desglose
 * compra/venta y ganancias por comisión. Los accesos rápidos llevan a
 * las vistas de gestión (clientes, usuarios, monedas e historial) y el
 * bloque de comisiones muestra lo ingresado por moneda destino, sin
 * depender de ningún cliente en sesión. Las tasas destacadas salen de
 * la API (`vigentes()` + `%` vs cotización anterior) con respaldo a
 * los mocks si la API falla. Las operaciones recientes se delegan en
 * {@link OperacionesRecientes} y no se modifican acá.
 *
 * @module admin/AdminDashboard
 */
import { useEffect, useState } from 'react'
import { type AuthUser, type Page, type ClienteActivo } from '@/types'
import { banderaDesdeCodigo, listarMonedas } from '@/services/monedas'
import { obtenerResumen, type ResumenOperaciones } from '@/services/resumen'
import { useTasasDestacadas } from '@/hooks/useTasasDestacadas'
import OperacionesRecientes from '@/components/OperacionesRecientes'

export interface AdminDashboardProps {
  auth: AuthUser
  currentClient: ClienteActivo | null
  navigate: (p: Page) => void
}

function formatoPYG(valor: number): string {
  return `₲ ${Math.round(valor).toLocaleString('es-PY')}`
}

export default function AdminDashboard({ auth, currentClient, navigate }: AdminDashboardProps) {
  const [resumen, setResumen] = useState<ResumenOperaciones | null>(null)
  const [errorResumen, setErrorResumen] = useState('')
  const [simbolos, setSimbolos] = useState<Record<string, { simbolo: string; decimales: number }>>({})
  const tasas = useTasasDestacadas()
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    let vivo = true
    setCargando(true)
    setErrorResumen('')

    obtenerResumen()
      .then(datos => { if (vivo) { setResumen(datos); setCargando(false) } })
      .catch(() => { if (vivo) { setErrorResumen('No se pudo cargar el resumen de operaciones.'); setCargando(false) } })

    listarMonedas()
      .then(monedas => {
        if (!vivo) return
        const mapa: Record<string, { simbolo: string; decimales: number }> = {}
        for (const m of monedas) mapa[m.code] = { simbolo: m.symbol, decimales: m.decimals }
        setSimbolos(mapa)
      })
      .catch(() => { /* sin símbolos, se usa el código */ })

    return () => { vivo = false }
  }, [])

  const greeting = (() => {
    const h = new Date().getHours()
    if (h < 12) return 'Buenos días'
    if (h < 18) return 'Buenas tardes'
    return 'Buenas noches'
  })()

  function formatoMoneda(codigo: string, valor: number): string {
    const info = simbolos[codigo]
    const dec = info?.decimales ?? (codigo === 'PYG' ? 0 : 2)
    const sim = info ? `${info.simbolo} ` : ''
    return `${sim}${valor.toLocaleString('es-PY', { minimumFractionDigits: dec, maximumFractionDigits: dec })}`
  }

  const tarjetas = resumen ? [
    { label: 'Volumen total operado', value: formatoPYG(resumen.volumen_total_pyg), sub: 'PAGADA · compra + venta', icon: '◈', color: '#0f3460' },
    { label: 'Operaciones', value: resumen.total_operaciones.toLocaleString('es-PY'), sub: `${resumen.compras} compras · ${resumen.ventas} ventas`, icon: '↑↓', color: '#10b981' },
    { label: 'Ganancias por comisiones', value: formatoPYG(resumen.ganancias_pyg), sub: 'Total en PYG', icon: '↗', color: '#f59e0b' },
  ] : []

  return (
    <div className="space-y-6 animate-fadein">
      {/* Welcome */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-[15px] text-slate-500 font-medium">{greeting},</h2>
          <h1 className="text-2xl font-bold text-slate-900" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>{auth.name.split(' ')[0]} 👋</h1>
          <p className="text-sm text-slate-400 mt-0.5">Vista general del negocio</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => navigate('admin-reports')} className="px-4 py-2 rounded-lg text-white text-[13px] font-semibold transition-all hover:-translate-y-0.5 hover:shadow-md" style={{ background: 'linear-gradient(135deg,#0f3460,#10b981)' }}>
            Ver reportes
          </button>
        </div>
      </div>

      {/* Stat cards */}
      {errorResumen ? (
        <p role="alert" className="bg-red-50 border border-red-100 text-red-600 text-[13px] rounded-xl px-4 py-3">{errorResumen}</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {(cargando && !resumen ? [0, 1, 2] : tarjetas).map((card) => (
            <div key={typeof card === 'number' ? `skel-${card}` : card.label} className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
              {typeof card === 'number' ? (
                <p className="py-4 text-center text-[13px] text-slate-400">Cargando…</p>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-[22px]">{card.icon}</span>
                  </div>
                  <div className="font-mono font-bold text-slate-900 text-lg leading-tight">{card.value}</div>
                  <div className="text-[11px] text-slate-400 font-medium mt-1">{card.label}</div>
                  <div className="text-[11px] text-slate-300 mt-0.5">{card.sub}</div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Quick actions */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
        <h3 className="font-semibold text-slate-800 text-[15px] mb-5" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Accesos rápidos</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {[
            { icon: '◎', label: 'Ver clientes', sub: 'Gestión de clientes', page: 'admin-clients' as Page, color: '#0f3460' },
            { icon: '👤', label: 'Ver usuarios', sub: 'Roles y accesos', page: 'admin-users' as Page, color: '#3b82f6' },
            { icon: '◈', label: 'Ver monedas', sub: 'Catálogo de divisas', page: 'admin-currencies' as Page, color: '#8b5cf6' },
            { icon: '≡', label: 'Historial', sub: 'Todas las operaciones', page: 'transactions' as Page, color: '#f59e0b' },
          ].map(item => (
            <button
              key={item.label}
              onClick={() => navigate(item.page)}
              className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-slate-50 transition-colors text-left"
            >
              <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm shrink-0" style={{ background: item.color }}>
                {item.icon}
              </div>
              <div>
                <div className="text-[13px] font-semibold text-slate-800">{item.label}</div>
                <div className="text-[11px] text-slate-400">{item.sub}</div>
              </div>
              <span className="ml-auto text-slate-300">›</span>
            </button>
          ))}
        </div>
      </div>

      {/* Comisiones + Recent transactions */}
      <div className="grid lg:grid-cols-5 gap-6">
        {/* Comisiones por moneda */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-100 shadow-sm p-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-semibold text-slate-800 text-[15px]" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Comisiones por moneda</h3>
            <button onClick={() => navigate('admin-earnings')} className="text-[12px] text-emerald-600 font-semibold hover:text-emerald-700">Ver todo →</button>
          </div>
          {cargando && !resumen ? (
            <p className="py-6 text-center text-[13px] text-slate-400">Cargando comisiones…</p>
          ) : !resumen || resumen.comisiones_por_moneda.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-slate-400">Todavía no hay comisiones.</p>
          ) : (
            <div className="space-y-3">
              {resumen.comisiones_por_moneda.map(c => (
                <div key={c.moneda} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors">
                  <div className="flex items-center gap-2.5">
                    <span className="text-lg">{banderaDesdeCodigo(c.moneda)}</span>
                    <div>
                      <div className="text-[13px] font-semibold text-slate-800">{c.moneda}</div>
                      <div className="text-[11px] text-slate-400">≈ {formatoPYG(c.equivalente_pyg)}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono font-bold text-slate-800 text-[13px]">{formatoMoneda(c.moneda, c.total)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent transactions: datos reales, sin cambios */}
        <OperacionesRecientes auth={auth} currentClient={currentClient} navigate={navigate} />
      </div>

      {/* Featured rates */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-semibold text-slate-800 text-[15px]" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Tasas destacadas</h3>
          <button onClick={() => navigate('admin-rates')} className="text-[12px] text-emerald-600 font-semibold hover:text-emerald-700">Ver histórico →</button>
        </div>
        {tasas.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-slate-400">Cargando tasas…</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {tasas.map(r => (
              <div key={r.moneda} className="rounded-lg border border-slate-100 p-3 text-center hover:border-emerald-200 hover:bg-emerald-50/30 transition-all cursor-pointer">
                <span className="text-xl">{r.flag}</span>
                <div className="font-bold text-slate-800 text-[13px] mt-1.5">{r.moneda}</div>
                <div className="font-mono text-[12px] text-slate-600 mt-0.5">₲ {r.venta.toLocaleString('es-PY')}</div>
                <div className={`text-[10px] font-semibold mt-1 ${r.cambio >= 0 ? 'text-emerald-500' : 'text-red-400'}`}>
                  {r.cambio >= 0 ? '▲' : '▼'} {Math.abs(r.cambio).toFixed(2)}%
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
