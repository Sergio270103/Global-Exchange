import { useState } from 'react'
import { exchangeRates } from '@/data/mockData'
import { type AuthUser } from '@/types'

interface BuySellProps {
  auth: AuthUser
  currentClient: string
}

type Step = 'form' | 'confirm' | 'receipt'

export default function BuySell({ auth, currentClient }: BuySellProps) {
  const [mode, setMode] = useState<'buy' | 'sell'>('buy')
  const [step, setStep] = useState<Step>('form')
  const [fromCurrency, setFromCurrency] = useState('USD')
  const [toCurrency, setToCurrency] = useState('PYG')
  const [amount, setAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('transfer')
  const [walletOrigin, setWalletOrigin] = useState('USD')

  const selectedRate = exchangeRates.find(r => r.currency === (mode === 'buy' ? fromCurrency : walletOrigin))
  const rate = mode === 'buy' ? (selectedRate?.sell || 7650) : (selectedRate?.buy || 7580)
  const amountNum = parseFloat(amount) || 0
  const total = mode === 'buy' ? amountNum * rate : amountNum * rate
  const commission = total * 0.001
  const finalAmount = mode === 'buy' ? total - commission : total - commission

  const trxId = `TRX-2024-${Math.floor(Math.random() * 9000 + 1000)}`

  const resetForm = () => { setStep('form'); setAmount('') }

  if (step === 'receipt') {
    return (
      <div className="max-w-lg mx-auto animate-fadein">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-5">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none"><path d="M6 16l7 7L26 9" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>¡Operación completada!</h2>
          <p className="text-slate-400 text-[14px] mb-6">Los fondos han sido acreditados en tu billetera</p>

          <div className="bg-slate-50 rounded-xl p-4 text-left space-y-3 mb-6">
            {[
              ['Número de operación', trxId],
              ['Tipo', `${mode === 'buy' ? 'Compra' : 'Venta'} de ${mode === 'buy' ? fromCurrency : walletOrigin}`],
              ['Monto', `${amountNum.toLocaleString()} ${mode === 'buy' ? fromCurrency : walletOrigin}`],
              ['Tipo de cambio', `₲ ${rate.toLocaleString()}`],
              ['Comisión', `₲ ${commission.toLocaleString('es', { maximumFractionDigits: 0 })}`],
              ['Total acreditado', `₲ ${finalAmount.toLocaleString('es', { maximumFractionDigits: 0 })}`],
              ['Fecha', 'Lun, 15 Enero 2024 · 14:35'],
              ['Cliente', currentClient],
            ].map(([label, value]) => (
              <div key={label as string} className="flex justify-between items-start">
                <span className="text-[12px] text-slate-400 font-medium">{label}</span>
                <span className={`text-[13px] font-semibold text-slate-800 text-right ${label === 'Total acreditado' ? 'text-emerald-600 font-mono' : ''}`}>{value}</span>
              </div>
            ))}
          </div>

          <div className="flex gap-3">
            <button className="flex-1 py-2.5 rounded-xl border border-slate-200 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
              📄 Descargar PDF
            </button>
            <button onClick={resetForm} className="flex-1 py-2.5 rounded-xl text-white text-[13px] font-semibold transition-all hover:-translate-y-0.5" style={{ background: 'linear-gradient(135deg,#0f3460,#10b981)' }}>
              Nueva operación
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (step === 'confirm') {
    return (
      <div className="max-w-lg mx-auto animate-fadein">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8">
          <h2 className="text-lg font-bold text-slate-900 mb-6" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Confirmar operación</h2>

          <div className="flex items-center gap-4 p-4 rounded-xl bg-slate-50 mb-6">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold ${mode === 'buy' ? 'bg-emerald-500' : 'bg-blue-500'}`}>
              {mode === 'buy' ? '↑' : '↓'}
            </div>
            <div>
              <div className="font-bold text-slate-900 text-[15px]">{mode === 'buy' ? 'Compra' : 'Venta'} de {mode === 'buy' ? fromCurrency : walletOrigin}</div>
              <div className="text-[13px] text-slate-400">Cliente: {currentClient}</div>
            </div>
          </div>

          <div className="space-y-3 mb-6">
            {[
              ['Monto', `${amountNum.toLocaleString()} ${mode === 'buy' ? fromCurrency : walletOrigin}`],
              ['Tipo de cambio', `₲ ${rate.toLocaleString()}`],
              ['Subtotal', `₲ ${total.toLocaleString('es', { maximumFractionDigits: 0 })}`],
              ['Comisión (0.1%)', `₲ ${commission.toLocaleString('es', { maximumFractionDigits: 0 })}`],
            ].map(([label, value]) => (
              <div key={label as string} className="flex justify-between py-2 border-b border-slate-50 last:border-0">
                <span className="text-[13px] text-slate-500">{label}</span>
                <span className="font-mono font-semibold text-slate-800 text-[13px]">{value}</span>
              </div>
            ))}
            <div className="flex justify-between py-3 bg-emerald-50 rounded-xl px-4 -mx-4">
              <span className="text-[14px] font-bold text-emerald-700">Total a {mode === 'buy' ? 'pagar' : 'recibir'}</span>
              <span className="font-mono font-extrabold text-emerald-700 text-[16px]">₲ {finalAmount.toLocaleString('es', { maximumFractionDigits: 0 })}</span>
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={() => setStep('form')} className="flex-1 py-3 rounded-xl border border-slate-200 text-[14px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
              Volver
            </button>
            <button onClick={() => setStep('receipt')} className="flex-1 py-3 rounded-xl text-white text-[14px] font-semibold transition-all hover:-translate-y-0.5 hover:shadow-lg" style={{ background: 'linear-gradient(135deg,#0f3460,#10b981)' }}>
              Confirmar {mode === 'buy' ? 'compra' : 'venta'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto animate-fadein">
      {/* Mode toggle */}
      <div className="flex rounded-xl border border-slate-200 bg-white p-1 mb-6 shadow-sm">
        <button
          onClick={() => setMode('buy')}
          className={`flex-1 py-3 rounded-lg text-[14px] font-semibold transition-all flex items-center justify-center gap-2 ${mode === 'buy' ? 'text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          style={mode === 'buy' ? { background: 'linear-gradient(135deg,#0f3460,#10b981)' } : {}}
        >
          <span>↑</span> Comprar divisas
        </button>
        <button
          onClick={() => setMode('sell')}
          className={`flex-1 py-3 rounded-lg text-[14px] font-semibold transition-all flex items-center justify-center gap-2 ${mode === 'sell' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          <span>↓</span> Vender divisas
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8">
        <h2 className="font-bold text-slate-900 text-lg mb-6" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
          {mode === 'buy' ? 'Comprar divisas' : 'Vender divisas'}
        </h2>

        <div className="space-y-5">
          {/* Client */}
          <div>
            <label className="block text-[12px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Cliente</label>
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-200 bg-slate-50">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-400 to-blue-500 flex items-center justify-center text-white text-xs font-bold">{currentClient.charAt(0)}</div>
              <span className="text-[14px] font-medium text-slate-800">{currentClient}</span>
            </div>
          </div>

          {mode === 'buy' ? (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[12px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Moneda a comprar</label>
                <select value={fromCurrency} onChange={e => setFromCurrency(e.target.value)} className="w-full border border-slate-200 rounded-xl px-4 py-3 text-[14px] font-medium text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300">
                  {exchangeRates.map(r => <option key={r.currency} value={r.currency}>{r.flag} {r.currency} — {r.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Pagar con</label>
                <select value={toCurrency} onChange={e => setToCurrency(e.target.value)} className="w-full border border-slate-200 rounded-xl px-4 py-3 text-[14px] font-medium text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300">
                  <option value="PYG">🇵🇾 PYG — Guaraní</option>
                </select>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[12px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Billetera origen</label>
                <select value={walletOrigin} onChange={e => setWalletOrigin(e.target.value)} className="w-full border border-slate-200 rounded-xl px-4 py-3 text-[14px] font-medium text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300">
                  {exchangeRates.map(r => <option key={r.currency} value={r.currency}>{r.flag} {r.currency}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Cuenta bancaria destino</label>
                <select className="w-full border border-slate-200 rounded-xl px-4 py-3 text-[14px] font-medium text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300">
                  <option>Banco Continental •••• 4521</option>
                  <option>Itaú Paraguay •••• 8832</option>
                </select>
              </div>
            </div>
          )}

          {/* Amount */}
          <div>
            <label className="block text-[12px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Monto ({mode === 'buy' ? fromCurrency : walletOrigin})
            </label>
            <div className="relative">
              <input
                type="number"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full border border-slate-200 rounded-xl px-4 py-3.5 text-[16px] font-mono font-semibold text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300 placeholder:text-slate-200"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex gap-2">
                {['100', '500', '1000'].map(v => (
                  <button key={v} onClick={() => setAmount(v)} className="text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-1 rounded hover:bg-emerald-100 transition-colors">
                    {v}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Payment method (buy only) */}
          {mode === 'buy' && (
            <div>
              <label className="block text-[12px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Método de pago</label>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { id: 'transfer', icon: '🏦', label: 'Transferencia' },
                  { id: 'wallet', icon: '◈', label: 'Billetera' },
                  { id: 'card', icon: '💳', label: 'Tarjeta' },
                  { id: 'qr', icon: '⊞', label: 'QR' },
                ].map(m => (
                  <button
                    key={m.id}
                    onClick={() => setPaymentMethod(m.id)}
                    className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border text-center transition-all ${paymentMethod === m.id ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 hover:border-slate-300'}`}
                  >
                    <span className="text-xl">{m.icon}</span>
                    <span className={`text-[11px] font-semibold ${paymentMethod === m.id ? 'text-emerald-600' : 'text-slate-500'}`}>{m.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Rate summary */}
          {amountNum > 0 && (
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 space-y-2.5 animate-fadein">
              <h4 className="font-semibold text-slate-700 text-[13px] mb-3">Resumen de la operación</h4>
              {[
                ['Tipo de cambio', `₲ ${rate.toLocaleString()}`],
                ['Subtotal', `₲ ${total.toLocaleString('es', { maximumFractionDigits: 0 })}`],
                ['Comisión (0.1%)', `₲ ${commission.toLocaleString('es', { maximumFractionDigits: 0 })}`],
              ].map(([label, value]) => (
                <div key={label as string} className="flex justify-between">
                  <span className="text-[12px] text-slate-400">{label}</span>
                  <span className="font-mono font-semibold text-slate-700 text-[12px]">{value}</span>
                </div>
              ))}
              <div className="border-t border-slate-200 pt-2.5 flex justify-between">
                <span className="text-[13px] font-bold text-slate-700">Total a {mode === 'buy' ? 'pagar' : 'recibir'}</span>
                <span className="font-mono font-extrabold text-emerald-600 text-[15px]">₲ {finalAmount.toLocaleString('es', { maximumFractionDigits: 0 })}</span>
              </div>
            </div>
          )}

          <button
            onClick={() => { if (amountNum > 0) setStep('confirm') }}
            disabled={amountNum <= 0}
            className="w-full py-4 rounded-xl text-white font-semibold text-[15px] transition-all hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
            style={{ background: 'linear-gradient(135deg,#0f3460,#10b981)' }}
          >
            Continuar →
          </button>
        </div>
      </div>
    </div>
  )
}
