import { useState } from 'react'
import { clients as initial } from '@/data/mockData'

const categoryColor: Record<string, string> = {
  Minorista: 'bg-blue-50 text-blue-700',
  Corporativo: 'bg-purple-50 text-purple-700',
  VIP: 'bg-amber-50 text-amber-700',
}

type ClientForm = { name: string; email: string; document: string; category: string; status: string }

const emptyForm: ClientForm = { name: '', email: '', document: '', category: 'Minorista', status: 'Activo' }

export default function Clients() {
  const [clients, setClients] = useState(initial)
  const [search, setSearch] = useState('')
  const [filterCat, setFilterCat] = useState('Todos')
  const [filterStatus, setFilterStatus] = useState('Todos')
  const [showModal, setShowModal] = useState(false)
  const [editClient, setEditClient] = useState<typeof initial[0] | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)
  const [form, setForm] = useState<ClientForm>(emptyForm)

  const filtered = clients.filter(c => {
    if (filterCat !== 'Todos' && c.category !== filterCat) return false
    if (filterStatus !== 'Todos' && c.status !== filterStatus) return false
    if (search && !c.name.toLowerCase().includes(search.toLowerCase()) && !c.email.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const setField = (key: keyof ClientForm, value: string) => setForm(f => ({ ...f, [key]: value }))

  const openCreate = () => {
    setEditClient(null)
    setForm(emptyForm)
    setShowModal(true)
  }

  const openEdit = (client: typeof initial[0]) => {
    setEditClient(client)
    setForm({ name: client.name, email: client.email, document: client.document, category: client.category, status: client.status })
    setShowModal(true)
  }

  const saveClient = () => {
    if (!form.name.trim() || !form.email.trim()) return
    if (editClient) {
      setClients(cs => cs.map(x => x.id === editClient.id ? { ...x, name: form.name, email: form.email, document: form.document, category: form.category, status: form.status } : x))
    } else {
      setClients(cs => [...cs, {
        id: cs.reduce((m, x) => Math.max(m, x.id), 0) + 1,
        name: form.name,
        category: form.category,
        operations: 0,
        users: 1,
        status: form.status,
        email: form.email,
        document: form.document,
        joined: new Date().toLocaleDateString('es', { month: 'short', year: 'numeric' }),
      }])
    }
    setShowModal(false)
  }

  const deleteClient = (id: number) => { setClients(c => c.filter(x => x.id !== id)); setDeleteConfirm(null) }
  const toggleStatus = (id: number) => setClients(c => c.map(x => x.id === id ? { ...x, status: x.status === 'Activo' ? 'Suspendido' : 'Activo' } : x))

  return (
    <div className="space-y-5 animate-fadein">
      {/* Summary */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total clientes', value: clients.length, color: '#0f3460' },
          { label: 'Activos', value: clients.filter(c => c.status === 'Activo').length, color: '#10b981' },
          { label: 'Corporativos', value: clients.filter(c => c.category === 'Corporativo').length, color: '#8b5cf6' },
          { label: 'VIP', value: clients.filter(c => c.category === 'VIP').length, color: '#f59e0b' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
            <div className="font-mono font-bold text-2xl" style={{ color: s.color }}>{s.value}</div>
            <div className="text-[11px] text-slate-400 font-medium mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar cliente..." className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-[13px] text-slate-700 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-300 placeholder:text-slate-300"/>
        </div>
        <select value={filterCat} onChange={e => setFilterCat(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-[13px] font-medium text-slate-700 bg-white focus:outline-none">
          <option value="Todos">Todas las categorías</option>
          <option>Minorista</option><option>Corporativo</option><option>VIP</option>
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-[13px] font-medium text-slate-700 bg-white focus:outline-none">
          <option value="Todos">Todos los estados</option>
          <option>Activo</option><option>Suspendido</option>
        </select>
        <button onClick={openCreate} className="ml-auto flex items-center gap-1.5 px-4 py-2 rounded-lg text-white text-[13px] font-semibold transition-all hover:-translate-y-0.5" style={{ background: 'linear-gradient(135deg,#0f3460,#10b981)' }}>
          + Nuevo cliente
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60">
                {['Cliente', 'Categoría', 'Operaciones', 'Usuarios', 'Estado', 'Ingresó', 'Acciones'].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map(client => (
                <tr key={client.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center text-slate-700 text-sm font-bold shrink-0">
                        {client.name.charAt(0)}
                      </div>
                      <div>
                        <div className="font-semibold text-slate-900 text-[14px]">{client.name}</div>
                        <div className="text-[12px] text-slate-400">{client.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${categoryColor[client.category]}`}>{client.category}</span>
                  </td>
                  <td className="px-5 py-4">
                    <span className="font-mono font-semibold text-slate-800 text-[14px]">{client.operations}</span>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-1.5">
                      {Array.from({ length: Math.min(client.users, 4) }).map((_, i) => (
                        <div key={i} className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-300 to-blue-500 border-2 border-white flex items-center justify-center text-white text-[9px] font-bold" style={{ marginLeft: i > 0 ? -8 : 0 }}>{i + 1}</div>
                      ))}
                      {client.users > 4 && <span className="text-[11px] text-slate-400 font-medium">+{client.users - 4}</span>}
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <button onClick={() => toggleStatus(client.id)} className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border cursor-pointer transition-colors ${client.status === 'Activo' ? 'bg-emerald-50 text-emerald-700 border-emerald-100 hover:bg-red-50 hover:text-red-600 hover:border-red-100' : 'bg-red-50 text-red-600 border-red-100 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-100'}`}>
                      {client.status}
                    </button>
                  </td>
                  <td className="px-5 py-4 text-[12px] text-slate-500">{client.joined}</td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <button onClick={() => openEdit(client)} className="text-[12px] font-semibold text-slate-500 hover:text-blue-600 px-2 py-1 rounded hover:bg-blue-50 transition-colors">Editar</button>
                      <button className="text-[12px] font-semibold text-slate-500 hover:text-purple-600 px-2 py-1 rounded hover:bg-purple-50 transition-colors">Usuarios</button>
                      <button onClick={() => setDeleteConfirm(client.id)} className="text-[12px] font-semibold text-slate-500 hover:text-red-500 px-2 py-1 rounded hover:bg-red-50 transition-colors">Eliminar</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm animate-fadein text-center">
            <div className="text-4xl mb-4">⚠️</div>
            <h3 className="font-bold text-slate-900 text-lg mb-2" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Eliminar cliente</h3>
            <p className="text-slate-500 text-[14px] mb-6">Esta acción no puede deshacerse. ¿Estás seguro?</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-[14px] font-semibold text-slate-700 hover:bg-slate-50">Cancelar</button>
              <button onClick={() => deleteClient(deleteConfirm)} className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-[14px] font-semibold hover:bg-red-600">Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit/Create modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-lg animate-fadein" onClick={e => e.stopPropagation()}>
            <h2 className="font-bold text-slate-900 text-lg mb-6" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
              {editClient ? 'Editar cliente' : 'Nuevo cliente'}
            </h2>
            <div className="space-y-4">
              {[
                { label: 'Nombre / Razón Social', placeholder: 'Nombre del cliente', key: 'name' },
                { label: 'Correo electrónico', placeholder: 'cliente@email.com', key: 'email' },
                { label: 'Documento / RUC', placeholder: '12.345.678-9', key: 'document' },
              ].map(f => (
                <div key={f.key}>
                  <label htmlFor={f.key} className="block text-[12px] font-semibold text-slate-500 uppercase tracking-wider mb-2">{f.label}</label>
                  <input id={f.key} value={form[f.key as keyof ClientForm]} onChange={e => setField(f.key as keyof ClientForm, e.target.value)} placeholder={f.placeholder} className="w-full border border-slate-200 rounded-xl px-4 py-3 text-[14px] text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-300"/>
                </div>
              ))}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="category" className="block text-[12px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Categoría</label>
                  <select id="category" value={form.category} onChange={e => setField('category', e.target.value)} className="w-full border border-slate-200 rounded-xl px-4 py-3 text-[14px] text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300">
                    <option>Minorista</option><option>Corporativo</option><option>VIP</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="status" className="block text-[12px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Estado</label>
                  <select id="status" value={form.status} onChange={e => setField('status', e.target.value)} className="w-full border border-slate-200 rounded-xl px-4 py-3 text-[14px] text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300">
                    <option>Activo</option><option>Suspendido</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowModal(false)} className="flex-1 py-3 rounded-xl border border-slate-200 text-[14px] font-semibold text-slate-700 hover:bg-slate-50">Cancelar</button>
              <button onClick={saveClient} className="flex-1 py-3 rounded-xl text-white text-[14px] font-semibold" style={{ background: 'linear-gradient(135deg,#0f3460,#10b981)' }}>
                {editClient ? 'Guardar cambios' : 'Crear cliente'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}