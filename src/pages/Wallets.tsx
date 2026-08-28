import { useState } from 'react'
import { wallets, bankAccounts } from '@/data/mockData'
import { exchangeRates } from '@/data/mockData'

type ModalType = 'deposit' | 'withdraw' | 'transfer' | null

export default function Wallets() {
  const [modal, setModal] = useState<ModalType>(null)
  const [selectedCurrency, setSelectedCurrency] = useState('USD')
  const [amount, setAmount] = useState('')

  const totalPYG = wallets.reduce((acc, w) => {
    if (w.currency === 'PYG') return acc + w.balance
    const rate = exchangeRates.find(r => r.currency === w.currency)?.sell || 1
    return acc + w.balance * rate
  }, 0)

  const modalConfig = {
    deposit: { title: 'Depositar fondos', action: 'Confirmar depósito', color: '#10b981', icon: '↓' },
    withdraw: { title: 'Retirar fondos', action: 'Confirmar retiro', color: '#3b82f6', icon: '↑' },
    transfer: { title: 'Transferir fondos', action: 'Confirmar transferencia', color: '#8b5cf6', icon: '⇌' },
  }

  return (
    <div className="space-y-6 animate-fadein">
      {/* Total */}
      <div className="rounded-2xl p-7 text-white relative overflow-hidden" style={{ background: 'linear-gradient(135deg,#0a1628,#0f3460)' }}>
        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '20px 20px' }}/>
        <div className="relative">
          <p className="text-white/50 text-[12px] font-semibold uppercase tracking-widest mb-2">Saldo total equivalente</p>
          <p className="font-mono font-extrabold text-[32px] leading-tight" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
            ₲ {Math.round(totalPYG).toLocaleString('es')}
          </p>
          <p className="text-white/40 text-[13px] mt-1.5">Actualizado: Lun, 15 Enero 2024 · 14:32</p>
        </div>
      </div>

      {/* Wallet cards */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {wallets.map(w => {
          const rate = w.currency === 'PYG' ? 1 : exchangeRates.find(r => r.currency === w.currency)?.sell || 1
          const inPYG = w.currency === 'PYG' ? w.balance : w.balance * rate
          return (
            <div key={w.currency} className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 hover:shadow-md hover:-translate-y-0.5 transition-all">
              <div className="flex items-center justify-between mb-4">
                <span className="text-2xl">{w.flag}</span>
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${w.change >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'}`}>
                  {w.change >= 0 ? '▲' : '▼'} {Math.abs(w.change)}%
                </span>
              </div>
              <div className="font-mono font-extrabold text-slate-900 text-xl" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                {w.symbol} {w.balance.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="text-[12px] text-slate-400 mt-1 font-semibold">{w.currency}</div>
              <div className="text-[11px] text-slate-300 mt-0.5">≈ ₲ {Math.round(inPYG).toLocaleString('es')}</div>
              <div className="flex gap-2 mt-4">
                {[
                  { label: '↓', tip: 'Depositar', action: 'deposit' as ModalType, color: '#10b981' },
                  { label: '↑', tip: 'Retirar', action: 'withdraw' as ModalType, color: '#3b82f6' },
                  { label: '⇌', tip: 'Transferir', action: 'transfer' as ModalType, color: '#8b5cf6' },
                ].map(btn => (
                  <button
                    key={btn.label}
                    onClick={() => { setSelectedCurrency(w.currency); setModal(btn.action) }}
                    title={btn.tip}
                    className="flex-1 py-1.5 rounded-lg text-white text-[12px] font-bold transition-all hover:-translate-y-0.5 hover:shadow-sm"
                    style={{ background: btn.color }}
                  >
                    {btn.label}
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Bank accounts */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-semibold text-slate-800 text-[15px]" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Cuentas bancarias vinculadas</h3>
          <button className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-semibold text-white transition-all hover:opacity-90" style={{ background: '#0f3460' }}>
            + Agregar cuenta
          </button>
        </div>
        <div className="space-y-3">
          {bankAccounts.map(acc => (
            <div key={acc.id} className="flex items-center gap-4 p-4 rounded-xl border border-slate-100 hover:bg-slate-50 transition-colors">
              <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-xl shrink-0">🏦</div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-slate-800 text-[14px]">{acc.bank}</div>
                <div className="text-[12px] text-slate-400">{acc.account} · {acc.currency} · {acc.holder}</div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${acc.status === 'Activa' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                  {acc.status}
                </span>
                <button className="text-slate-300 hover:text-red-400 transition-colors">✕</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md animate-fadein" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-lg" style={{ background: modalConfig[modal].color }}>
                {modalConfig[modal].icon}
              </div>
              <h2 className="font-bold text-slate-900 text-lg" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>{modalConfig[modal].title}</h2>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-[12px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Moneda</label>
                <select value={selectedCurrency} onChange={e => setSelectedCurrency(e.target.value)} className="w-full border border-slate-200 rounded-xl px-4 py-3 text-[14px] text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300">
                  {wallets.map(w => <option key={w.currency} value={w.currency}>{w.flag} {w.currency}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Monto</label>
                <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" className="w-full border border-slate-200 rounded-xl px-4 py-3 text-[16px] font-mono font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-300 placeholder:text-slate-200"/>
              </div>
              {modal !== 'deposit' && (
                <div>
                  <label className="block text-[12px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
                    {modal === 'transfer' ? 'Moneda destino' : 'Cuenta bancaria destino'}
                  </label>
                  <select className="w-full border border-slate-200 rounded-xl px-4 py-3 text-[14px] text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300">
                    {modal === 'transfer'
                      ? wallets.filter(w => w.currency !== selectedCurrency).map(w => <option key={w.currency}>{w.flag} {w.currency}</option>)
                      : bankAccounts.map(a => <option key={a.id}>{a.bank} {a.account}</option>)
                    }
                  </select>
                </div>
              )}
              <div className="flex gap-3 mt-2">
                <button onClick={() => setModal(null)} className="flex-1 py-3 rounded-xl border border-slate-200 text-[14px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
                  Cancelar
                </button>
                <button onClick={() => setModal(null)} className="flex-1 py-3 rounded-xl text-white text-[14px] font-semibold transition-all hover:-translate-y-0.5" style={{ background: modalConfig[modal].color }}>
                  {modalConfig[modal].action}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
