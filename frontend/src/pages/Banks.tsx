/**
 * Vista de cuentas bancarias del cliente (medios de pago, RF16/RF26).
 *
 * Conectada a la API Django: lista las cuentas vinculadas del cliente
 * seleccionado, permite vincular una nueva con los datos mínimos
 * exigidos (Nombre, Apellido, Nº Cédula, Entidad bancaria, Nº de cuenta
 * bancaria y Código Bancario), editarla o eliminarla con confirmación.
 * La baja es lógica en el backend. El número de cuenta viaja
 * enmascarado y nunca se expone en claro.
 *
 * @module Banks
 */
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { listarClientes, type Cliente } from '@/services/clientes'
import { listarCuentas, crearCuenta, actualizarCuenta, eliminarCuenta } from '@/services/cuentas'
import { listarMonedas } from '@/services/monedas'
import type { BankAccount } from '@/types'

/** Entidades bancarias disponibles para vincular. */
const bankOptions = [
  'Banco Continental',
  'Itaú Paraguay',
  'Banco Nacional de Fomento',
  'Sudameris Bank',
  'Banco Atlas',
  'Banco Familiar',
]

/** Valores iniciales del formulario de cuenta bancaria. */
const emptyForm = {
  firstName: '',
  lastName: '',
  document: '',
  bank: '',
  account: '',
  code: '',
  currency: 'PYG',
}

/** Muestra el número de cuenta enmascarado (solo últimos 4 dígitos). */
function maskAccount(account: string): string {
  if (account.includes('•')) return account
  const digits = account.replace(/\D/g, '')
  if (digits.length <= 4) return account
  return `•••• •••• ${digits.slice(-4)}`
}

/**
 * Valida el formulario y devuelve los errores por campo (vacío si es válido).
 *
 * El Nº de cuenta solo se exige cuando no hay uno previo conservado: al
 * editar una cuenta cuyo número viaja enmascarado, el campo puede quedar
 * vacío y se mantiene el valor original.
 */
function validateForm(form: typeof emptyForm, requireAccount: boolean): Record<string, string> {
  const errors: Record<string, string> = {}
  if (form.firstName.trim().length < 2) errors.firstName = 'El nombre es obligatorio (mínimo 2 caracteres)'
  if (form.lastName.trim().length < 2) errors.lastName = 'El apellido es obligatorio (mínimo 2 caracteres)'
  if (form.document.trim().length < 4) errors.document = 'El Nº de cédula es obligatorio'
  if (!form.bank) errors.bank = 'Seleccioná la entidad bancaria'
  if (requireAccount && form.account.replace(/\D/g, '').length < 6) errors.account = 'El Nº de cuenta debe tener al menos 6 dígitos'
  if (!form.code.trim()) errors.code = 'El código bancario es obligatorio'
  if (!form.currency) errors.currency = 'Seleccioná la moneda de la cuenta'
  return errors
}

const inputClass = 'w-full border border-slate-200 rounded-xl px-4 py-2.5 text-[14px] text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300'
const labelClass = 'block text-[12px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5'

export default function Banks() {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [clienteId, setClienteId] = useState<number | null>(null)
  const [monedas, setMonedas] = useState<{ id: number; code: string; name: string; flag: string }[]>([])
  const [accounts, setAccounts] = useState<BankAccount[]>([])
  const [cargando, setCargando] = useState(true)
  const [aviso, setAviso] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [originalAccount, setOriginalAccount] = useState('')
  const [confirmId, setConfirmId] = useState<number | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    Promise.all([listarClientes({ activo: true }), listarMonedas(true)])
      .then(([cs, ms]) => {
        setClientes(cs)
        setMonedas(ms)
        if (cs.length > 0) setClienteId(cs[0].id)
        else setCargando(false)
      })
      .catch(() => {
        setAviso('No se pudieron cargar los datos. Verificá que el backend esté corriendo.')
        setCargando(false)
      })
  }, [])

  useEffect(() => {
    if (clienteId === null) return
    setCargando(true)
    listarCuentas(clienteId)
      .then(setAccounts)
      .catch(() => setAviso('No se pudieron cargar las cuentas del cliente.'))
      .finally(() => setCargando(false))
  }, [clienteId])

  const set = (field: keyof typeof emptyForm, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }))
    setErrors(prev => {
      if (!prev[field]) return prev
      const next = { ...prev }
      delete next[field]
      return next
    })
  }

  const monedaIdPorCodigo = (code: string): number | undefined =>
    monedas.find(m => m.code === code)?.id

  const openCreate = () => {
    setForm({ ...emptyForm, currency: monedas[0]?.code ?? 'PYG' })
    setErrors({})
    setAviso('')
    setEditingId(null)
    setOriginalAccount('')
    setShowForm(true)
  }

  const openEdit = (acc: BankAccount) => {
    setForm({
      firstName: acc.firstName,
      lastName: acc.lastName,
      document: acc.document,
      bank: acc.bank,
      account: acc.account.includes('•') ? '' : acc.account,
      code: acc.code,
      currency: acc.currency,
    })
    setErrors({})
    setAviso('')
    setEditingId(acc.id)
    setOriginalAccount(acc.account)
    setShowForm(true)
  }

  const handleSubmit = async () => {
    if (clienteId === null) {
      setAviso('Primero tiene que existir un cliente: crealo en Clientes (administración).')
      return
    }
    const validation = validateForm(form, !originalAccount || form.account.trim().length > 0)
    setErrors(validation)
    if (Object.keys(validation).length > 0) return
    const monedaId = monedaIdPorCodigo(form.currency)
    if (!monedaId) {
      setErrors({ currency: 'Seleccioná la moneda de la cuenta' })
      return
    }

    setGuardando(true)
    try {
      if (editingId !== null) {
        const actualizada = await actualizarCuenta(editingId, {
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          document: form.document.trim(),
          bank: form.bank,
          account: form.account.trim(),
          code: form.code.trim(),
          moneda: monedaId,
        })
        setAccounts(prev => prev.map(acc => (acc.id === editingId ? actualizada : acc)))
        setAviso('Se guardaron los cambios de la cuenta.')
      } else {
        const creada = await crearCuenta({
          cliente: clienteId,
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          document: form.document.trim(),
          bank: form.bank,
          account: form.account.trim(),
          code: form.code.trim(),
          moneda: monedaId,
        })
        setAccounts(prev => [...prev, creada])
        setAviso('La cuenta quedó vinculada.')
      }
      setShowForm(false)
    } catch (err) {
      setAviso(err instanceof Error ? err.message : 'No se pudo guardar la cuenta.')
    } finally {
      setGuardando(false)
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await eliminarCuenta(id)
      setAccounts(prev => prev.filter(acc => acc.id !== id))
      setAviso('La cuenta quedó desvinculada.')
    } catch (err) {
      setAviso(err instanceof Error ? err.message : 'No se pudo eliminar la cuenta.')
    }
    setConfirmId(null)
  }

  const confirmTarget = confirmId !== null ? accounts.find(acc => acc.id === confirmId) : undefined

  return (
    <div className="space-y-5 animate-fadein">
      {/* Header */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 flex items-center justify-between flex-wrap gap-4">
        <div>
          <h3 className="font-semibold text-slate-800 text-[15px]" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Cuentas bancarias</h3>
          <p className="text-[12px] text-slate-400 mt-0.5">
            {cargando ? 'Cargando…' : accounts.length === 1 ? '1 cuenta vinculada' : `${accounts.length} cuentas vinculadas`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label htmlFor="bank-client" className="sr-only">Cliente</label>
          <select
            id="bank-client"
            value={clienteId ?? ''}
            onChange={e => setClienteId(Number(e.target.value))}
            className="border border-slate-200 rounded-lg px-3 py-2 text-[13px] font-medium text-slate-700 bg-white focus:outline-none"
          >
            {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
          <button onClick={openCreate} disabled={clienteId === null} className="px-4 py-2 rounded-lg text-white text-[13px] font-semibold transition-all hover:opacity-90 disabled:opacity-50" style={{ background: '#0f3460' }}>
            + Agregar cuenta
          </button>
        </div>
      </div>

      {aviso && (
        <div role="status" className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-[13px] text-slate-600">
          {aviso}
        </div>
      )}

      {/* Sin clientes: no se puede operar */}
      {!cargando && clientes.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-[13px] text-amber-800">
          Todavía no hay clientes registrados. Un administrador debe crear al menos uno en <strong>Clientes</strong> antes de vincular cuentas.
        </div>
      )}

      {/* List */}
      {cargando ? (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-16 text-center text-slate-400 text-[14px]">
          Cargando cuentas…
        </div>
      ) : accounts.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-16 text-center">
          <div className="text-5xl mb-4">🏦</div>
          <h3 className="font-bold text-slate-900 text-xl mb-2" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Sin cuentas vinculadas</h3>
          <p className="text-slate-400 text-[14px] mb-6">Vinculá tu primera cuenta bancaria para operar como medio de pago</p>
          <button onClick={openCreate} className="px-4 py-2 rounded-lg text-white text-[13px] font-semibold transition-all hover:opacity-90" style={{ background: '#0f3460' }}>
            + Agregar cuenta
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
          <div className="space-y-3">
            {accounts.map(acc => (
              <div key={acc.id} className="flex items-center gap-4 p-4 rounded-xl border border-slate-100 hover:bg-slate-50 transition-colors">
                <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-xl shrink-0">🏦</div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-slate-800 text-[14px]">{acc.bank}</div>
                  <div className="text-[12px] text-slate-400 font-mono">{maskAccount(acc.account)} · {acc.currency}</div>
                  <div className="text-[12px] text-slate-400">{acc.holder} · CI {acc.document} · Cód. {acc.code}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${acc.status === 'Activa' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                    {acc.status}
                  </span>
                  <button onClick={() => openEdit(acc)} aria-label={`Editar cuenta ${acc.bank}`} title="Editar" className="w-8 h-8 rounded-lg text-slate-400 hover:text-[#0f3460] hover:bg-slate-100 transition-colors text-[15px]">
                    ✎
                  </button>
                  <button onClick={() => setConfirmId(acc.id)} aria-label={`Eliminar cuenta ${acc.bank}`} title="Eliminar" className="w-8 h-8 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors text-[15px]">
                    🗑
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create/Edit modal (portal: escapa del contenedor animado para centrarse al viewport) */}
      {showForm && createPortal((
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-lg animate-fadein max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h2 className="font-bold text-slate-900 text-lg mb-6" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
              {editingId !== null ? 'Editar cuenta bancaria' : 'Agregar cuenta bancaria'}
            </h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="bank-firstName" className={labelClass}>Nombre</label>
                <input id="bank-firstName" value={form.firstName} onChange={e => set('firstName', e.target.value)} placeholder="Carlos" className={inputClass} />
                {errors.firstName && <p className="text-red-500 text-[12px] mt-1">{errors.firstName}</p>}
              </div>
              <div>
                <label htmlFor="bank-lastName" className={labelClass}>Apellido</label>
                <input id="bank-lastName" value={form.lastName} onChange={e => set('lastName', e.target.value)} placeholder="Martínez" className={inputClass} />
                {errors.lastName && <p className="text-red-500 text-[12px] mt-1">{errors.lastName}</p>}
              </div>
              <div>
                <label htmlFor="bank-document" className={labelClass}>Nº de cédula</label>
                <input id="bank-document" value={form.document} onChange={e => set('document', e.target.value)} placeholder="12.345.678" className={inputClass} />
                {errors.document && <p className="text-red-500 text-[12px] mt-1">{errors.document}</p>}
              </div>
              <div>
                <label htmlFor="bank-bank" className={labelClass}>Entidad bancaria</label>
                <select id="bank-bank" value={form.bank} onChange={e => set('bank', e.target.value)} className={inputClass}>
                  <option value="">Seleccionar banco…</option>
                  {bankOptions.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
                {errors.bank && <p className="text-red-500 text-[12px] mt-1">{errors.bank}</p>}
              </div>
              <div>
                <label htmlFor="bank-account" className={labelClass}>Número de cuenta</label>
                <input id="bank-account" value={form.account} onChange={e => set('account', e.target.value)} placeholder={editingId !== null && originalAccount.includes('•') ? `${originalAccount} (se conserva)` : '001-02-345678'} className={inputClass} />
                {errors.account && <p className="text-red-500 text-[12px] mt-1">{errors.account}</p>}
              </div>
              <div>
                <label htmlFor="bank-code" className={labelClass}>Código bancario</label>
                <input id="bank-code" value={form.code} onChange={e => set('code', e.target.value)} placeholder="BCON-PY" className={inputClass} />
                {errors.code && <p className="text-red-500 text-[12px] mt-1">{errors.code}</p>}
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="bank-currency" className={labelClass}>Moneda</label>
                <select id="bank-currency" value={form.currency} onChange={e => set('currency', e.target.value)} className={inputClass}>
                  {monedas.map(m => <option key={m.code} value={m.code}>{m.flag} {m.code} — {m.name}</option>)}
                </select>
                {errors.currency && <p className="text-red-500 text-[12px] mt-1">{errors.currency}</p>}
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowForm(false)} className="flex-1 py-3 rounded-xl border border-slate-200 text-[14px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
                Cancelar
              </button>
              <button onClick={handleSubmit} disabled={guardando} className="flex-1 py-3 rounded-xl text-white text-[14px] font-semibold transition-all hover:-translate-y-0.5 disabled:opacity-60" style={{ background: '#0f3460' }}>
                {guardando ? 'Guardando…' : editingId !== null ? 'Guardar cambios' : 'Vincular cuenta'}
              </button>
            </div>
          </div>
        </div>
      ), document.body)}

      {/* Delete confirm modal (portal: escapa del contenedor animado para centrarse al viewport) */}
      {confirmTarget && createPortal((
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setConfirmId(null)}>
          <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md animate-fadein" onClick={e => e.stopPropagation()}>
            <h2 className="font-bold text-slate-900 text-lg mb-2" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Eliminar cuenta</h2>
            <p className="text-slate-500 text-[14px] mb-6">
              ¿Eliminar la cuenta {maskAccount(confirmTarget.account)} de {confirmTarget.bank}? Esta acción no se puede deshacer.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmId(null)} className="flex-1 py-3 rounded-xl border border-slate-200 text-[14px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
                Cancelar
              </button>
              <button onClick={() => handleDelete(confirmTarget.id)} className="flex-1 py-3 rounded-xl text-white text-[14px] font-semibold bg-red-500 hover:bg-red-600 transition-colors">
                Eliminar
              </button>
            </div>
          </div>
        </div>
      ), document.body)}
    </div>
  )
}
