/**
 * Vista de tasas de cambio con gestión CRUD.
 * Únicamente el Administrador puede Crear, Editar y Eliminar tasas de cambio.
 *
 * @module Rates
 */
import { useState } from 'react'
import { exchangeRates as initialRates, historicalRates } from '@/data/mockData'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { Plus, Edit2, Trash2, X } from 'lucide-react'
import { type AuthUser } from '@/types'

const periods = ['Hoy', 'Semana', 'Mes', 'Año', 'Personalizado']
const chartTypes = ['Líneas', 'Barras']

interface RateItem {
  currency: string
  name: string
  flag: string
  buy: number
  sell: number
  change: number
  updatedAt: string
}

interface RatesProps {
  authUser?: AuthUser | null
}

export default function Rates({ authUser }: RatesProps) {
  // 🔒 SEGURIDAD: Solo si el rol es exactamente admin o administrador
  const userRole = authUser?.role?.toString().toLowerCase().trim() || ''
  const isAdmin = userRole === 'admin' || userRole === 'administrador'

  // Estado principal para administrar las tasas (CRUD)
  const [rates, setRates] = useState<RateItem[]>(initialRates)
  const [selectedCurrency, setSelectedCurrency] = useState('USD')
  const [period, setPeriod] = useState('Mes')
  const [chartType, setChartType] = useState('Líneas')
  const [filterCurrency, setFilterCurrency] = useState('Todos')

  // Estados para Modal Formulario (CREATE / UPDATE)
  const [showModal, setShowModal] = useState(false)
  const [editingCurrency, setEditingCurrency] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    currency: '',
    name: '',
    flag: '💵',
    buy: '',
    sell: '',
    change: '0'
  })

  // Abrir Modal para Crear
  const handleOpenCreate = () => {
    setEditingCurrency(null)
    setFormData({ currency: '', name: '', flag: '💵', buy: '', sell: '', change: '0' })
    setShowModal(true)
  }

  // Abrir Modal para Editar
  const handleOpenEdit = (rate: RateItem, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingCurrency(rate.currency)
    setFormData({
      currency: rate.currency,
      name: rate.name,
      flag: rate.flag,
      buy: rate.buy.toString(),
      sell: rate.sell.toString(),
      change: rate.change.toString()
    })
    setShowModal(true)
  }

  // Guardar (Crear o Actualizar)
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const now = new Date()
    const timeString = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`

    if (editingCurrency) {
      setRates(rates.map(r => r.currency === editingCurrency ? {
        ...r,
        name: formData.name,
        flag: formData.flag,
        buy: Number(formData.buy),
        sell: Number(formData.sell),
        change: Number(formData.change),
        updatedAt: `Hoy ${timeString}`
      } : r))
    } else {
      const newRate: RateItem = {
        currency: formData.currency.toUpperCase(),
        name: formData.name,
        flag: formData.flag,
        buy: Number(formData.buy),
        sell: Number(formData.sell),
        change: Number(formData.change),
        updatedAt: `Hoy ${timeString}`
      }
      setRates([...rates, newRate])
      setSelectedCurrency(newRate.currency)
    }

    setShowModal(false)
  }

  // Eliminar (DELETE)
  const handleDelete = (currencyCode: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (confirm(`¿Estás seguro de eliminar la cotización de ${currencyCode}?`)) {
      const updated = rates.filter(r => r.currency !== currencyCode)
      setRates(updated)
      if (selectedCurrency === currencyCode && updated.length > 0) {
        setSelectedCurrency(updated[0].currency)
      }
    }
  }

  const rateData = historicalRates[selectedCurrency] || historicalRates['USD'] || []
  const displayData = rateData.slice(
    period === 'Hoy' ? 29 : period === 'Semana' ? 23 : period === 'Mes' ? 0 : 0
  )

  const filteredRates = filterCurrency === 'Todos' ? rates : rates.filter(r => r.currency === filterCurrency)

  return (
    <div className="space-y-6 animate-fadein">
      {/* Cards de Tasas */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
        <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
          <div>
            <h3 className="font-semibold text-slate-800 text-[15px]" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Tasas en tiempo real</h3>
            <p className="text-[12px] text-slate-400 mt-0.5 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse-slow inline-block"/>
              Actualizadas el Lun, 15 Enero 2024 · 14:32
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            {/* BOTÓN "NUEVA TASA" - SOLO APARECE SI isAdmin ES TRUE */}
            {isAdmin && (
              <button 
                onClick={handleOpenCreate}
                className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 rounded-lg font-semibold text-[13px] transition-colors shadow-sm"
              >
                <Plus size={16} /> Nueva Tasa
              </button>
            )}
            
            <select value={filterCurrency} onChange={e => setFilterCurrency(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-[13px] font-medium text-slate-700 bg-white focus:outline-none">
              <option value="Todos">Todas las monedas</option>
              {rates.map(r => <option key={r.currency} value={r.currency}>{r.currency}</option>)}
            </select>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredRates.map(r => (
            <div
              key={r.currency}
              onClick={() => setSelectedCurrency(r.currency)}
              className={`relative group rounded-xl border p-4 cursor-pointer transition-all hover:shadow-md ${selectedCurrency === r.currency ? 'border-emerald-300 bg-emerald-50/30 shadow-sm' : 'border-slate-100 hover:border-slate-200'}`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <span className="text-2xl">{r.flag}</span>
                  <div>
                    <div className="font-bold text-slate-900 text-[14px]" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>{r.currency}</div>
                    <div className="text-slate-400 text-[11px]">{r.name}</div>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${r.change >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'}`}>
                    {r.change >= 0 ? '▲' : '▼'} {Math.abs(r.change)}%
                  </span>
                  
                  {/* BOTONES EDITAR Y ELIMINAR - SOLO APARECEN SI isAdmin ES TRUE */}
                  {isAdmin && (
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                      <button 
                        onClick={(e) => handleOpenEdit(r, e)}
                        className="p-1 text-slate-400 hover:text-blue-600 hover:bg-white rounded shadow-sm"
                        title="Editar"
                      >
                        <Edit2 size={13} />
                      </button>
                      <button 
                        onClick={(e) => handleDelete(r.currency, e)}
                        className="p-1 text-slate-400 hover:text-rose-600 hover:bg-white rounded shadow-sm"
                        title="Eliminar"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="bg-slate-50 rounded-lg p-2.5">
                  <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-1">COMPRA</div>
                  <div className="font-mono font-bold text-slate-800 text-[13px]">₲ {r.buy.toLocaleString()}</div>
                </div>
                <div className="bg-emerald-50 rounded-lg p-2.5">
                  <div className="text-[10px] text-emerald-600 font-semibold uppercase tracking-wider mb-1">VENTA</div>
                  <div className="font-mono font-bold text-emerald-700 text-[13px]">₲ {r.sell.toLocaleString()}</div>
                </div>
              </div>

              <div className="flex items-center justify-between mt-2.5">
                <span className="text-[10px] text-slate-300">Act. {r.updatedAt}</span>
                {selectedCurrency === r.currency && (
                  <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full">Seleccionada ✓</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Gráfico histórico */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <h3 className="font-semibold text-slate-800 text-[15px]" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
              Evolución histórica — {selectedCurrency}
            </h3>
            <p className="text-[12px] text-slate-400 mt-0.5">Compra y venta en guaraníes</p>
          </div>
          <div className="flex gap-3 flex-wrap">
            <div className="flex rounded-lg border border-slate-200 overflow-hidden">
              {periods.map(p => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-3 py-1.5 text-[12px] font-semibold transition-colors ${period === p ? 'bg-[#0f3460] text-white' : 'text-slate-500 hover:bg-slate-50'}`}
                >
                  {p}
                </button>
              ))}
            </div>
            <div className="flex rounded-lg border border-slate-200 overflow-hidden">
              {chartTypes.map(ct => (
                <button
                  key={ct}
                  onClick={() => setChartType(ct)}
                  className={`px-3 py-1.5 text-[12px] font-semibold transition-colors ${chartType === ct ? 'bg-slate-700 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
                >
                  {ct}
                </button>
              ))}
            </div>
          </div>
        </div>

        <ResponsiveContainer width="100%" height={280}>
          {chartType === 'Líneas' ? (
            <LineChart data={displayData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false}/>
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} interval={Math.floor((displayData.length || 1) / 8)}/>
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => `₲${v.toLocaleString()}`} width={80}/>
              <Tooltip
                contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0,0,0,0.08)', fontSize: 12 }}
                formatter={(v: unknown, name: unknown) => [`₲ ${(v as number).toLocaleString()}`, name === 'buy' ? 'Compra' : 'Venta']}
              />
              <Legend iconType="circle" iconSize={8} formatter={(v) => v === 'buy' ? 'Compra' : 'Venta'}/>
              <Line type="monotone" dataKey="buy" stroke="#0f3460" strokeWidth={2} dot={false} name="buy"/>
              <Line type="monotone" dataKey="sell" stroke="#10b981" strokeWidth={2} dot={false} name="sell"/>
            </LineChart>
          ) : (
            <BarChart data={displayData.slice(-14)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false}/>
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false}/>
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => `₲${v.toLocaleString()}`} width={80}/>
              <Tooltip
                contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0,0,0,0.08)', fontSize: 12 }}
                formatter={(v: unknown, name: unknown) => [`₲ ${(v as number).toLocaleString()}`, name === 'buy' ? 'Compra' : 'Venta']}
              />
              <Legend iconType="circle" iconSize={8} formatter={(v) => v === 'buy' ? 'Compra' : 'Venta'}/>
              <Bar dataKey="buy" fill="#0f3460" radius={[4, 4, 0, 0]} name="buy"/>
              <Bar dataKey="sell" fill="#10b981" radius={[4, 4, 0, 0]} name="sell"/>
            </BarChart>
          )}
        </ResponsiveContainer>

        <div className="grid grid-cols-4 gap-4 mt-6 pt-5 border-t border-slate-100">
          {[
            { label: 'Compra actual', value: `₲ ${(rates.find(r => r.currency === selectedCurrency)?.buy || 0).toLocaleString()}` },
            { label: 'Venta actual', value: `₲ ${(rates.find(r => r.currency === selectedCurrency)?.sell || 0).toLocaleString()}` },
            { label: 'Mín. del período', value: `₲ ${displayData.length ? Math.min(...displayData.map(d => d.buy)).toLocaleString() : 0}` },
            { label: 'Máx. del período', value: `₲ ${displayData.length ? Math.max(...displayData.map(d => d.sell)).toLocaleString() : 0}` },
          ].map(stat => (
            <div key={stat.label}>
              <div className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider mb-1">{stat.label}</div>
              <div className="font-mono font-bold text-slate-800 text-[14px]">{stat.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Modal Formulario */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex justify-center items-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full shadow-xl border border-slate-100 p-6 space-y-4 animate-fadein max-h-[90vh] overflow-y-auto my-auto">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-800 text-[16px]">
                {editingCurrency ? `Editar Tasa — ${editingCurrency}` : 'Agregar Nueva Tasa'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 p-1">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3.5">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-1">
                  <label className="text-[11px] font-semibold text-slate-500 uppercase">Código</label>
                  <input 
                    type="text" 
                    required 
                    disabled={!!editingCurrency}
                    placeholder="USD" 
                    value={formData.currency}
                    onChange={e => setFormData({ ...formData, currency: e.target.value })}
                    className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm font-bold uppercase outline-none focus:border-emerald-500 disabled:bg-slate-100"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-[11px] font-semibold text-slate-500 uppercase">Nombre</label>
                  <input 
                    type="text" 
                    required 
                    placeholder="Dólar Estadounidense" 
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 uppercase">Tasa Compra (₲)</label>
                  <input 
                    type="number" 
                    required 
                    placeholder="7400" 
                    value={formData.buy}
                    onChange={e => setFormData({ ...formData, buy: e.target.value })}
                    className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 uppercase">Tasa Venta (₲)</label>
                  <input 
                    type="number" 
                    required 
                    placeholder="7450" 
                    value={formData.sell}
                    onChange={e => setFormData({ ...formData, sell: e.target.value })}
                    className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 uppercase">Bandera (Emoji)</label>
                  <input 
                    type="text" 
                    value={formData.flag}
                    onChange={e => setFormData({ ...formData, flag: e.target.value })}
                    className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 uppercase">Variación (%)</label>
                  <input 
                    type="number" 
                    step="0.01" 
                    value={formData.change}
                    onChange={e => setFormData({ ...formData, change: e.target.value })}
                    className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button 
                  type="button" 
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="px-4 py-2 text-xs font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors shadow-sm"
                >
                  Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}