import { useState } from 'react'
import { users as initial } from '@/data/mockData'

const roleColor: Record<string, { bg: string; text: string }> = {
  Administrador: { bg: '#fef3c7', text: '#d97706' },
  'Analista Cambiario': { bg: '#ede9fe', text: '#7c3aed' },
  Usuario: { bg: '#f0fdf4', text: '#16a34a' },
}

export default function Users() {
  const [users, setUsers] = useState(initial)
  const [search, setSearch] = useState('')
  const [filterRole, setFilterRole] = useState('Todos')
  const [showModal, setShowModal] = useState(false)
  const [editUser, setEditUser] = useState<typeof initial[0] | null>(null)

  const filtered = users.filter(u => {
    if (filterRole !== 'Todos' && u.role !== filterRole) return false
    if (search && !u.name.toLowerCase().includes(search.toLowerCase()) && !u.email.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const toggleStatus = (id: number) => setUsers(u => u.map(x => x.id === id ? { ...x, status: x.status === 'Activo' ? 'Suspendido' : 'Activo' } : x))
  const deleteUser = (id: number) => setUsers(u => u.filter(x => x.id !== id))

  return (
    <div className="space-y-5 animate-fadein">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total usuarios', value: users.length, color: '#0f3460' },
          { label: 'Activos', value: users.filter(u => u.status === 'Activo').length, color: '#10b981' },
          { label: 'Analistas', value: users.filter(u => u.role === 'Analista Cambiario').length, color: '#8b5cf6' },
          { label: 'Admins', value: users.filter(u => u.role === 'Administrador').length, color: '#f59e0b' },
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
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar usuario..." className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-[13px] text-slate-700 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-300 placeholder:text-slate-300"/>
        </div>
        <select value={filterRole} onChange={e => setFilterRole(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-[13px] font-medium text-slate-700 bg-white focus:outline-none">
          <option value="Todos">Todos los roles</option>
          <option>Administrador</option><option>Analista Cambiario</option><option>Usuario</option>
        </select>
        <button onClick={() => { setEditUser(null); setShowModal(true) }} className="ml-auto flex items-center gap-1.5 px-4 py-2 rounded-lg text-white text-[13px] font-semibold transition-all hover:-translate-y-0.5" style={{ background: 'linear-gradient(135deg,#0f3460,#10b981)' }}>
          + Nuevo usuario
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/60">
              {['Usuario', 'Rol', 'Cliente', 'Estado', 'Último acceso', 'Acciones'].map(h => (
                <th key={h} className="px-5 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filtered.map(user => {
              const rc = roleColor[user.role] || { bg: '#f1f5f9', text: '#64748b' }
              return (
                <tr key={user.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0" style={{ background: 'linear-gradient(135deg,#132952,#10b981)' }}>
                        {user.name.charAt(0)}
                      </div>
                      <div>
                        <div className="font-semibold text-slate-900 text-[14px]">{user.name}</div>
                        <div className="text-[12px] text-slate-400">{user.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full" style={{ backgroundColor: rc.bg, color: rc.text }}>{user.role}</span>
                  </td>
                  <td className="px-5 py-4 text-[13px] text-slate-600 font-medium">{user.client}</td>
                  <td className="px-5 py-4">
                    <button onClick={() => toggleStatus(user.id)} className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border cursor-pointer transition-colors ${user.status === 'Activo' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-red-50 text-red-600 border-red-100'}`}>
                      {user.status}
                    </button>
                  </td>
                  <td className="px-5 py-4 text-[12px] text-slate-500">{user.lastLogin}</td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <button onClick={() => { setEditUser(user); setShowModal(true) }} className="text-[12px] font-semibold text-slate-500 hover:text-blue-600 px-2 py-1 rounded hover:bg-blue-50 transition-colors">Editar</button>
                      <button className="text-[12px] font-semibold text-slate-500 hover:text-purple-600 px-2 py-1 rounded hover:bg-purple-50 transition-colors">Asignar</button>
                      <button onClick={() => deleteUser(user.id)} className="text-[12px] font-semibold text-slate-500 hover:text-red-500 px-2 py-1 rounded hover:bg-red-50 transition-colors">Eliminar</button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md animate-fadein" onClick={e => e.stopPropagation()}>
            <h2 className="font-bold text-slate-900 text-lg mb-6" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
              {editUser ? 'Editar usuario' : 'Nuevo usuario'}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-[12px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Nombre completo</label>
                <input defaultValue={editUser?.name} placeholder="Nombre Apellido" className="w-full border border-slate-200 rounded-xl px-4 py-3 text-[14px] text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-300"/>
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Correo electrónico</label>
                <input defaultValue={editUser?.email} placeholder="usuario@email.com" type="email" className="w-full border border-slate-200 rounded-xl px-4 py-3 text-[14px] text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-300"/>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[12px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Rol</label>
                  <select defaultValue={editUser?.role || 'Usuario'} className="w-full border border-slate-200 rounded-xl px-4 py-3 text-[14px] text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300">
                    <option>Administrador</option><option>Analista Cambiario</option><option>Usuario</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[12px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Cliente</label>
                  <select defaultValue={editUser?.client} className="w-full border border-slate-200 rounded-xl px-4 py-3 text-[14px] text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300">
                    <option>Carlos Martínez</option><option>Corporación Atlas S.A.</option><option>Ana López</option><option>Global Exchange</option>
                  </select>
                </div>
              </div>
              {!editUser && (
                <div>
                  <label className="block text-[12px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Contraseña temporal</label>
                  <input type="password" placeholder="Mínimo 8 caracteres" className="w-full border border-slate-200 rounded-xl px-4 py-3 text-[14px] text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-300"/>
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowModal(false)} className="flex-1 py-3 rounded-xl border border-slate-200 text-[14px] font-semibold text-slate-700 hover:bg-slate-50">Cancelar</button>
              <button onClick={() => setShowModal(false)} className="flex-1 py-3 rounded-xl text-white text-[14px] font-semibold" style={{ background: 'linear-gradient(135deg,#0f3460,#10b981)' }}>
                {editUser ? 'Guardar' : 'Crear usuario'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
