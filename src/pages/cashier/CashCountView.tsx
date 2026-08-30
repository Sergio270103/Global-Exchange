import { useState } from 'react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

interface DenominationCount {
  denomination: number
  count: number
}

interface CashRecord {
  id: string
  date: string
  time: string
  type: 'Ingreso' | 'Egreso' | 'Arqueo'
  currency: 'USD' | 'PYG' | 'EUR'
  total: number
  user: string
}

// Datos iniciales para el gráfico e historial
const initialHistory: CashRecord[] = [
  { id: 'REC-001', date: '28/08', time: '08:30', type: 'Ingreso', currency: 'USD', total: 5000, user: 'Ivana E.' },
  { id: 'REC-002', date: '28/08', time: '10:15', type: 'Ingreso', currency: 'PYG', total: 15000000, user: 'Ivana E.' },
  { id: 'REC-003', date: '28/08', time: '12:00', type: 'Ingreso', currency: 'USD', total: 3200, user: 'Ivana E.' },
  { id: 'REC-004', date: '28/08', time: '14:45', type: 'Ingreso', currency: 'EUR', total: 2500, user: 'Ivana E.' },
  { id: 'REC-005', date: '28/08', time: '16:20', type: 'Ingreso', currency: 'USD', total: 7800, user: 'Ivana E.' },
]

const chartData = [
  { time: '08:00', USD: 2000, PYG: 5000000 },
  { time: '10:00', USD: 7000, PYG: 20000000 },
  { time: '12:00', USD: 10200, PYG: 22000000 },
  { time: '14:00', USD: 10200, PYG: 35000000 },
  { time: '16:00', USD: 18000, PYG: 41000000 },
]

export default function CashCountView() {
  // Estado de pestañas por moneda
  const [selectedCurrency, setSelectedCurrency] = useState<'USD' | 'PYG' | 'EUR'>('USD')

  // Estado para denominaciones dinámicas según la moneda activa
  const [denominations, setDenominations] = useState<Record<string, DenominationCount[]>>({
    USD: [
      { denomination: 100, count: 0 },
      { denomination: 50, count: 0 },
      { denomination: 20, count: 0 },
      { denomination: 10, count: 0 },
      { denomination: 5, count: 0 },
    ],
    PYG: [
      { denomination: 100000, count: 0 },
      { denomination: 50000, count: 0 },
      { denomination: 20000, count: 0 },
      { denomination: 10000, count: 0 },
      { denomination: 5000, count: 0 },
    ],
    EUR: [
      { denomination: 200, count: 0 },
      { denomination: 100, count: 0 },
      { denomination: 50, count: 0 },
      { denomination: 20, count: 0 },
      { denomination: 10, count: 0 },
    ],
  })

  // Modal para Registro de Dinero Recibido
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [receivedAmount, setReceivedAmount] = useState<number | ''>('')
  const [receivedCurrency, setReceivedCurrency] = useState<'USD' | 'PYG' | 'EUR'>('USD')
  const [receivedNote, setReceivedNote] = useState('')
  const [history, setHistory] = useState<CashRecord[]>(initialHistory)

  // Cálculo del total actual de billetes por moneda
  const currentDenoms = denominations[selectedCurrency]
  const totalInCash = currentDenoms.reduce((acc, item) => acc + item.denomination * item.count, 0)

  const handleDenomChange = (index: number, val: number) => {
    const updated = [...currentDenoms]
    updated[index].count = val >= 0 ? val : 0
    setDenominations({ ...denominations, [selectedCurrency]: updated })
  }

  const handleSaveReceivedMoney = (e: React.FormEvent) => {
    e.preventDefault()
    if (!receivedAmount || receivedAmount <= 0) return

    const newRecord: CashRecord = {
      id: `REC-00${history.length + 1}`,
      date: new Date().toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit' }),
      time: new Date().toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' }),
      type: 'Ingreso',
      currency: receivedCurrency,
      total: Number(receivedAmount),
      user: 'Cajero Activo',
    }

    setHistory([newRecord, ...history])
    setIsModalOpen(false)
    setReceivedAmount('')
    setReceivedNote('')
  }

  return (
    <div className="space-y-6 animate-fadein text-slate-800">
      {/* HEADER CON LABEL Y BOTÓN DE REGISTRO */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full uppercase tracking-wider">
            Gestión de Ventanilla
          </span>
          <h2 className="text-xl font-bold text-slate-900 mt-1" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
            Arqueo & Control de Caja
          </h2>
          <p className="text-xs text-slate-400">Recuento físico de billetes y remesas de efectivo recibidas.</p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-lg shadow-sm transition-all flex items-center gap-2"
        >
          <span>📥</span> Registrar Dinero Recibido
        </button>
      </div>

      {/* SECCIÓN PRINCIPAL: SELECCIÓN DE MONEDA + ARQUEO */}
      <div className="grid lg:grid-cols-3 gap-6">
        
        {/* PANEL DE DENOMINACIONES DE BILLETES */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-100 shadow-sm p-6 space-y-5">
          
          {/* DIVISIÓN EN TIPOS DE MONEDA (TABS) */}
          <div className="flex items-center justify-between border-b pb-4">
            <h3 className="font-semibold text-sm text-slate-800">Conteo por Denominación</h3>
            <div className="flex bg-slate-100 p-1 rounded-lg gap-1">
              {(['USD', 'PYG', 'EUR'] as const).map((curr) => (
                <button
                  key={curr}
                  onClick={() => setSelectedCurrency(curr)}
                  className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                    selectedCurrency === curr
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {curr === 'USD' ? '🇺🇸 USD' : curr === 'PYG' ? '🇵🇾 PYG' : '🇪🇺 EUR'}
                </button>
              ))}
            </div>
          </div>

          {/* LISTA DE DENOMINACIONES */}
          <div className="grid sm:grid-cols-2 gap-3">
            {currentDenoms.map((item, idx) => (
              <div key={item.denomination} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-100">
                <div>
                  <div className="text-xs font-bold text-slate-700">
                    Billete {selectedCurrency === 'USD' ? '$' : selectedCurrency === 'EUR' ? '€' : '₲'} {item.denomination.toLocaleString()}
                  </div>
                  <div className="text-[10px] text-slate-400">Subtotal: {(item.denomination * item.count).toLocaleString()}</div>
                </div>
                <input
                  type="number"
                  min="0"
                  value={item.count || ''}
                  onChange={(e) => handleDenomChange(idx, Number(e.target.value))}
                  placeholder="0"
                  className="w-24 px-3 py-1.5 border border-slate-200 rounded-lg text-sm text-right font-mono font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                />
              </div>
            ))}
          </div>

          {/* RESUMEN TOTAL DEL ARQUEO */}
          <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-4 flex justify-between items-center">
            <div>
              <span className="text-xs text-emerald-800 font-medium block">Total Arqueado ({selectedCurrency})</span>
              <span className="text-xs text-emerald-600">Calculado automáticamente</span>
            </div>
            <div className="text-2xl font-bold font-mono text-emerald-700">
              {selectedCurrency === 'USD' ? '$' : selectedCurrency === 'EUR' ? '€' : '₲'} {totalInCash.toLocaleString()}
            </div>
          </div>
        </div>

        {/* ÚLTIMOS REGISTROS EN LISTA */}
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 space-y-4">
          <h3 className="font-semibold text-sm text-slate-800 border-b pb-2">📋 Dinero Recibido Reciente</h3>
          <div className="space-y-3">
            {history.slice(0, 5).map((rec) => (
              <div key={rec.id} className="flex justify-between items-center p-2.5 rounded-lg bg-slate-50 text-xs">
                <div>
                  <span className="font-bold text-slate-800 block">{rec.type} en {rec.currency}</span>
                  <span className="text-[10px] text-slate-400">{rec.date} - {rec.time} · {rec.user}</span>
                </div>
                <div className="font-mono font-bold text-emerald-600 text-sm">
                  +{rec.currency === 'USD' ? '$' : rec.currency === 'EUR' ? '€' : '₲'} {rec.total.toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* GRÁFICO DE LOS ÚLTIMOS REGISTROS */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3 className="font-semibold text-sm text-slate-800">Evolución del Efectivo en Caja</h3>
            <p className="text-xs text-slate-400">Fluctuación de registros de los últimos arqueos del día</p>
          </div>
          <span className="text-xs text-emerald-600 font-bold bg-emerald-50 px-2 py-1 rounded">En Tiempo Real</span>
        </div>

        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="usdGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.2}/>
                <stop offset="100%" stopColor="#10b981" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false}/>
            <XAxis dataKey="time" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false}/>
            <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false}/>
            <Tooltip
              contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
              formatter={(val: unknown) => [`$ ${(val as number).toLocaleString()}`, 'Acumulado']}
            />
            <Area type="monotone" dataKey="USD" stroke="#10b981" strokeWidth={2} fill="url(#usdGrad)"/>
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* MODAL REGISTRO DE DINERO RECIBIDO */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex justify-center items-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex justify-between items-center border-b pb-3">
              <h3 className="font-bold text-slate-900 text-sm">📥 Registrar Dinero Recibido</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 text-sm">✕</button>
            </div>

            <form onSubmit={handleSaveReceivedMoney} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-600 block mb-1">Moneda</label>
                <select
                  value={receivedCurrency}
                  onChange={(e) => setReceivedCurrency(e.target.value as any)}
                  className="w-full p-2.5 border rounded-lg bg-white text-xs font-medium"
                >
                  <option value="USD">USD - Dólares</option>
                  <option value="PYG">PYG - Guaraníes</option>
                  <option value="EUR">EUR - Euros</option>
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-600 block mb-1">Monto Ingresado</label>
                <input
                  type="number"
                  required
                  placeholder="Ej. 5000"
                  value={receivedAmount}
                  onChange={(e) => setReceivedAmount(e.target.value ? Number(e.target.value) : '')}
                  className="w-full p-2.5 border rounded-lg text-xs font-mono font-bold"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-600 block mb-1">Notas / Observación</label>
                <input
                  type="text"
                  placeholder="Ej. Recibido de transportadora de valores"
                  value={receivedNote}
                  onChange={(e) => setReceivedNote(e.target.value)}
                  className="w-full p-2.5 border rounded-lg text-xs"
                />
              </div>

              <div className="flex gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-2.5 border rounded-lg text-slate-600 font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg shadow-sm"
                >
                  Guardar Ingreso
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}