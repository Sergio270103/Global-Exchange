/**
 * Vista de cuentas bancarias del cliente (medios de pago, RF16/RF26).
 *
 * Permite al cliente gestionar sus propios medios de pago: listar las
 * cuentas bancarias vinculadas, agregar una nueva con los datos mínimos
 * exigidos (Nombre, Apellido, Nº Cédula, Entidad bancaria, Nº de cuenta
 * bancaria y Código Bancario), editarla o eliminarla con confirmación.
 *
 * Los datos viven en `mockData.bankAccounts` mientras no exista
 * integración con el backend; esta vista opera sobre una copia local.
 *
 * @module Banks
 */
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { bankAccounts, exchangeRates } from '@/data/mockData'
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
  const [accounts, setAccounts] = useState<BankAccount[]>(() => [...bankAccounts])
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [originalAccount, setOriginalAccount] = useState('')
  const [confirmId, setConfirmId] = useState<number | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [errors, setErrors] = useState<Record<string, string>>({})

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
    setEditingId(acc.id)
    setOriginalAccount(acc.account)
    setShowForm(true)
  }

  const handleSubmit = () => {
    const account = form.account.trim() || originalAccount
    const validation = validateForm(form, !originalAccount || form.account.trim().length > 0)
    setErrors(validation)
    if (Object.keys(validation).length > 0) return

    const holder = `${form.firstName.trim()} ${form.lastName.trim()}`
    if (editingId !== null) {
      setAccounts(prev => prev.map(acc =>
        acc.id === editingId
          ? { ...acc, firstName: form.firstName.trim(), lastName: form.lastName.trim(), holder, document: form.document.trim(), bank: form.bank, account, code: form.code.trim(), currency: form.currency }
          : acc
      ))
    } else {
      const nextId = Math.max(0, ...accounts.map(acc => acc.id)) + 1
      setAccounts(prev => [...prev, {
        id: nextId,
        bank: form.bank,
        account: form.account.trim(),
        code: form.code.trim(),
        holder,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        document: form.document.trim(),
        currency: form.currency,
        status: 'Activa',
      }])
    }
    setShowForm(false)
  }

  const handleDelete = (id: number) => {
    setAccounts(prev => prev.filter(acc => acc.id !== id))
    setConfirmId(null)
  }

  const confirmTarget = confirmId !== null ? accounts.find(acc => acc.id === confirmId) : undefined

  return (
    <div className="space-y-5 animate-fadein">
      {/* Header */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-slate-800 text-[15px]" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Cuentas bancarias</h3>
          <p className="text-[12px] text-slate-400 mt-0.5">{accounts.length === 1 ? '1 cuenta vinculada' : `${accounts.length} cuentas vinculadas`}</p>
        </div>
        <button onClick={openCreate} className="px-4 py-2 rounded-lg text-white text-[13px] font-semibold transition-all hover:opacity-90" style={{ background: '#0f3460' }}>
          + Agregar cuenta
        </button>
      </div>

      {/* List */}
      {accounts.length === 0 ? (
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
                  {exchangeRates.map(r => <option key={r.currency} value={r.currency}>{r.flag} {r.currency} — {r.name}</option>)}
                </select>
                {errors.currency && <p className="text-red-500 text-[12px] mt-1">{errors.currency}</p>}
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowForm(false)} className="flex-1 py-3 rounded-xl border border-slate-200 text-[14px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
                Cancelar
              </button>
              <button onClick={handleSubmit} className="flex-1 py-3 rounded-xl text-white text-[14px] font-semibold transition-all hover:-translate-y-0.5" style={{ background: '#0f3460' }}>
                {editingId !== null ? 'Guardar cambios' : 'Vincular cuenta'}
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
