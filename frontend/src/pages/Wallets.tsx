/**
 * Vista de billeteras digitales conectada a la API Django (PI-66).
 *
 * Muestra los saldos multidivisa del cliente (nacen en cero, RF15/RF17)
 * y sus medios de acreditación vinculados (guía Hito 5): qué billetera
 * o cuenta bancaria recibe los fondos por defecto. Las operaciones de
 * depósito, retiro y transferencia llegan en otro PI.
 *
 * @module Wallets
 */
import { useEffect, useState } from 'react'
import {
  listarBilleteras,
  listarMedios,
  crearMedio,
  marcarDefault,
  eliminarMedio,
  type Billetera,
  type MedioAcreditacion,
} from '@/services/billeteras'
import { listarCuentas } from '@/services/cuentas'
import { misClientes } from '@/services/clientes'
import { vigentes } from '@/services/cotizaciones'
import type { BankAccount } from '@/types'
import { type ClienteActivo, type Page } from '@/types'

/** Propiedades de la vista de billeteras. */
export interface WalletsProps {
  /** Función para navegar entre páginas (usada para ir al CRUD de cuentas). */
  navigate: (page: Page) => void
  /** Cliente activo de la sesión (si la app ya lo tiene elegido). */
  currentClient?: ClienteActivo | null
}

export default function Wallets({ navigate, currentClient }: WalletsProps) {
  const [clientes, setClientes] = useState<{ id: number; nombre: string }[]>([])
  const [clienteId, setClienteId] = useState<number | null>(currentClient?.id ?? null)
  const [billeteras, setBilleteras] = useState<Billetera[]>([])
  const [medios, setMedios] = useState<MedioAcreditacion[]>([])
  const [cuentas, setCuentas] = useState<BankAccount[]>([])
  const [tasas, setTasas] = useState<Record<string, number>>({})
  const [cargando, setCargando] = useState(true)
  const [aviso, setAviso] = useState('')

  const [showMedio, setShowMedio] = useState(false)
  const [tipoMedio, setTipoMedio] = useState<'BILLETERA' | 'CUENTA'>('BILLETERA')
  const [destinoMedio, setDestinoMedio] = useState('')
  const [defectoMedio, setDefectoMedio] = useState(false)
  const [guardandoMedio, setGuardandoMedio] = useState(false)
  const [confirmMedio, setConfirmMedio] = useState<number | null>(null)

  useEffect(() => {
    misClientes()
      .then(mios => {
        setClientes(mios)
        if (clienteId === null && mios.length > 0) setClienteId(mios[0].id)
        if (mios.length === 0) setCargando(false)
      })
      .catch(() => {
        setAviso('No se pudieron cargar los clientes. Verificá que el backend esté corriendo.')
        setCargando(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (currentClient && currentClient.id !== clienteId) setClienteId(currentClient.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentClient])

  useEffect(() => {
    if (clienteId === null) return
    setCargando(true)
    Promise.all([
      listarBilleteras(clienteId),
      listarMedios(clienteId),
      listarCuentas(clienteId),
      vigentes().catch(() => []),
    ])
      .then(([bs, ms, cs, vs]) => {
        setBilleteras(bs)
        setMedios(ms)
        setCuentas(cs)
        setTasas(Object.fromEntries(vs.map(v => [v.moneda, v.venta])))
      })
      .catch(() => setAviso('No se pudieron cargar las billeteras del cliente.'))
      .finally(() => setCargando(false))
  }, [clienteId])

  const totalPYG = billeteras.reduce((acc, b) => {
    if (b.moneda_codigo === 'PYG') return acc + b.saldo
    return acc + b.saldo * (tasas[b.moneda_codigo] ?? 0)
  }, 0)

  const guardarMedio = async () => {
    if (clienteId === null || !destinoMedio) {
      setAviso('Elegí el destino del medio de acreditación.')
      return
    }
    setGuardandoMedio(true)
    try {
      const creado = await crearMedio({
        cliente: clienteId,
        tipo: tipoMedio,
        billetera: tipoMedio === 'BILLETERA' ? Number(destinoMedio) : null,
        cuenta: tipoMedio === 'CUENTA' ? Number(destinoMedio) : null,
        es_default: defectoMedio,
      })
      setMedios(prev => {
        const resto = defectoMedio ? prev.map(m => ({ ...m, es_default: false })) : prev
        return [...resto, creado]
      })
      setAviso(`${creado.destino_detalle} quedó vinculado como medio de acreditación.`)
      setShowMedio(false)
      setDestinoMedio('')
      setDefectoMedio(false)
    } catch (err) {
      setAviso(err instanceof Error ? err.message : 'No se pudo vincular el medio.')
    } finally {
      setGuardandoMedio(false)
    }
  }

  const hacerDefault = async (id: number) => {
    try {
      const actualizado = await marcarDefault(id)
      setMedios(prev => prev.map(m => (m.id === id ? actualizado : { ...m, es_default: false })))
      setAviso('Medio por defecto actualizado.')
    } catch (err) {
      setAviso(err instanceof Error ? err.message : 'No se pudo marcar como defecto.')
    }
  }

  const borrarMedio = async (id: number) => {
    try {
      await eliminarMedio(id)
      setMedios(prev => prev.filter(m => m.id !== id))
      setAviso('Medio desvinculado.')
    } catch (err) {
      setAviso(err instanceof Error ? err.message : 'No se pudo desvincular.')
    }
    setConfirmMedio(null)
  }

  const destinos = tipoMedio === 'BILLETERA'
    ? billeteras.map(b => ({ id: b.id, label: `${b.flag} ${b.moneda_codigo} — saldo ${b.saldo.toLocaleString()}` }))
    : cuentas.filter(c => c.status === 'Activa').map(c => ({ id: c.id, label: `${c.bank} · ${c.account} (${c.currency})` }))

  return (
    <div className="space-y-6 animate-fadein">
      {/* Cliente */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 flex items-center justify-between flex-wrap gap-4">
        <div>
          <h3 className="font-semibold text-slate-800 text-[15px]" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Billetera digital multidivisa</h3>
          <p className="text-[12px] text-slate-400 mt-0.5">Saldos por moneda y medios de acreditación vinculados</p>
        </div>
        <label className="flex items-center gap-2 text-[13px] text-slate-500 font-medium">
          Cliente
          <select
            aria-label="Cliente de la billetera"
            value={clienteId ?? ''}
            onChange={e => setClienteId(Number(e.target.value))}
            className="border border-slate-200 rounded-lg px-3 py-2 text-[13px] font-medium text-slate-700 bg-white focus:outline-none"
          >
            {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </label>
      </div>

      {aviso && (
        <div role="status" className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-[13px] text-slate-600">
          {aviso}
        </div>
      )}

      {cargando ? (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-16 text-center text-slate-400 text-[14px]">
          Cargando billetera…
        </div>
      ) : clienteId === null ? (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-16 text-center">
          <div className="text-5xl mb-4">👛</div>
          <h3 className="font-bold text-slate-900 text-xl mb-2" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Sin cliente asociado</h3>
          <p className="text-slate-400 text-[14px]">Asociá tu usuario a un cliente para ver su billetera.</p>
        </div>
      ) : (
        <>
          {/* Total */}
          <div className="rounded-2xl p-7 text-white relative overflow-hidden" style={{ background: 'linear-gradient(135deg,#0a1628,#0f3460)' }}>
            <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '20px 20px' }} />
            <div className="relative">
              <p className="text-white/50 text-[12px] font-semibold uppercase tracking-widest mb-2">Saldo total equivalente</p>
              <p className="font-mono font-extrabold text-[32px] leading-tight" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                ₲ {Math.round(totalPYG).toLocaleString('es')}
              </p>
              <p className="text-white/40 text-[13px] mt-1.5">A tasa vigente del día</p>
            </div>
          </div>

          {/* Saldos */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {billeteras.map(b => (
              <div key={b.moneda_codigo} className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-2xl">{b.flag}</span>
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">Billetera</span>
                </div>
                <div className="font-mono font-extrabold text-slate-900 text-xl" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                  {b.saldo.toLocaleString('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="text-[12px] text-slate-400 mt-1 font-semibold">{b.moneda_codigo} — {b.moneda_nombre}</div>
              </div>
            ))}
          </div>

          {/* Medios de acreditación */}
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <div>
                <h3 className="font-semibold text-slate-800 text-[15px]" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Medios de acreditación</h3>
                <p className="text-[12px] text-slate-400 mt-0.5">Dónde recibe los fondos este cliente (el defecto se preselecciona al operar)</p>
              </div>
              <button onClick={() => setShowMedio(true)} className="px-4 py-2 rounded-lg text-white text-[13px] font-semibold" style={{ background: '#0f3460' }}>
                + Vincular medio
              </button>
            </div>

            {medios.length === 0 ? (
              <p className="text-slate-400 text-[13px]">Sin medios vinculados. Vinculá una billetera o una cuenta bancaria.</p>
            ) : (
              <div className="space-y-2">
                {medios.map(m => (
                  <div key={m.id} className="flex items-center gap-3 p-3 rounded-xl border border-slate-100">
                    <span className="text-xl">{m.tipo === 'BILLETERA' ? '👛' : '🏦'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-slate-800 text-[14px] truncate">{m.destino_detalle}</div>
                      <div className="text-[12px] text-slate-400">{m.tipo_display}</div>
                    </div>
                    {m.es_default ? (
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600">Por defecto</span>
                    ) : (
                      <button onClick={() => hacerDefault(m.id)} className="text-[12px] font-semibold text-slate-500 hover:text-emerald-600 px-2 py-1 rounded hover:bg-emerald-50 transition-colors">
                        Marcar defecto
                      </button>
                    )}
                    <button onClick={() => setConfirmMedio(m.id)} className="text-[12px] font-semibold text-slate-400 hover:text-red-500 px-2 py-1 rounded hover:bg-red-50 transition-colors" aria-label={`Desvincular ${m.destino_detalle}`}>
                      🗑
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button onClick={() => navigate('banks')} className="mt-4 text-[13px] font-semibold text-emerald-600 hover:text-emerald-700">
              Gestionar cuentas bancarias →
            </button>
          </div>
        </>
      )}

      {/* Modal vincular medio */}
      {showMedio && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowMedio(false)}>
          <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md animate-fadein" onClick={e => e.stopPropagation()}>
            <h2 className="font-bold text-slate-900 text-lg mb-6" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
              Vincular medio de acreditación
            </h2>
            <div className="space-y-4">
              <div>
                <label htmlFor="medio-tipo" className="block text-[12px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Tipo</label>
                <select id="medio-tipo" value={tipoMedio} onChange={e => { setTipoMedio(e.target.value as 'BILLETERA' | 'CUENTA'); setDestinoMedio('') }} className="w-full border border-slate-200 rounded-xl px-4 py-3 text-[14px] text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300">
                  <option value="BILLETERA">Billetera digital</option>
                  <option value="CUENTA">Cuenta bancaria</option>
                </select>
              </div>
              <div>
                <label htmlFor="medio-destino" className="block text-[12px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Destino</label>
                <select id="medio-destino" value={destinoMedio} onChange={e => setDestinoMedio(e.target.value)} className="w-full border border-slate-200 rounded-xl px-4 py-3 text-[14px] text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300">
                  <option value="">Seleccionar…</option>
                  {destinos.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
                </select>
              </div>
              <label className="flex items-center gap-2 text-[13px] text-slate-600 font-medium cursor-pointer">
                <input type="checkbox" checked={defectoMedio} onChange={e => setDefectoMedio(e.target.checked)} className="w-4 h-4 accent-emerald-600" />
                Usar como medio por defecto al operar
              </label>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowMedio(false)} className="flex-1 py-3 rounded-xl border border-slate-200 text-[14px] font-semibold text-slate-700 hover:bg-slate-50">Cancelar</button>
              <button onClick={guardarMedio} disabled={guardandoMedio} className="flex-1 py-3 rounded-xl text-white text-[14px] font-semibold disabled:opacity-60" style={{ background: '#0f3460' }}>
                {guardandoMedio ? 'Guardando…' : 'Vincular'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmar desvinculación */}
      {confirmMedio !== null && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setConfirmMedio(null)}>
          <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm animate-fadein text-center" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-slate-900 text-lg mb-2" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Desvincular medio</h3>
            <p className="text-slate-500 text-[14px] mb-6">El cliente deja de recibir fondos por este medio.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmMedio(null)} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-[14px] font-semibold text-slate-700 hover:bg-slate-50">Cancelar</button>
              <button onClick={() => borrarMedio(confirmMedio)} className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-[14px] font-semibold hover:bg-red-600">Desvincular</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
