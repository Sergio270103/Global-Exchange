/**
 * Gestión de usuarios asociados a clientes (administración).
 *
 * Las cuentas de acceso y los roles se administran en Keycloak
 * (RF44/RF53–RF55). Aquí se gestionan las asociaciones usuario-cliente:
 * qué usuarios pueden operar en nombre de cada cliente (RF8/RF9/RF43).
 * Un usuario puede estar asociado a varios clientes y viceversa.
 *
 * @module Users
 */
import { useEffect, useState } from 'react'
import {
  listarClientes,
  listarAsociaciones,
  crearAsociacion,
  eliminarAsociacion,
  type Cliente,
  type Asociacion,
} from '@/services/clientes'

type AsocForm = { cliente: string; username: string; email: string; keycloak_id: string }

const emptyForm: AsocForm = { cliente: '', username: '', email: '', keycloak_id: '' }

export default function Users() {
  const [asocs, setAsocs] = useState<Asociacion[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [cargando, setCargando] = useState(true)
  const [aviso, setAviso] = useState('')
  const [search, setSearch] = useState('')
  const [filterClient, setFilterClient] = useState('Todos')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState<AsocForm>(emptyForm)
  const [formError, setFormError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)

  useEffect(() => {
    Promise.all([listarAsociaciones(), listarClientes({ activo: true })])
      .then(([as, cs]) => {
        setAsocs(as)
        setClientes(cs)
      })
      .catch(() => setAviso('No se pudieron cargar las asociaciones. Verificá que el backend esté corriendo.'))
      .finally(() => setCargando(false))
  }, [])

  const filtered = asocs.filter(a => {
    if (filterClient !== 'Todos' && a.cliente_nombre !== filterClient) return false
    if (search) {
      const texto = `${a.username} ${a.email} ${a.cliente_nombre}`.toLowerCase()
      if (!texto.includes(search.toLowerCase())) return false
    }
    return true
  })

  const setField = (key: keyof AsocForm, value: string) => setForm(f => ({ ...f, [key]: value }))

  const openCreate = () => {
    setForm({ ...emptyForm, cliente: clientes[0] ? String(clientes[0].id) : '' })
    setFormError('')
    setAviso('')
    setShowModal(true)
  }

  const saveAsoc = async () => {
    if (!form.cliente || !form.keycloak_id.trim()) {
      setFormError('Seleccioná el cliente e indicá el sub de Keycloak del usuario.')
      return
    }
    setGuardando(true)
    try {
      const creada = await crearAsociacion({
        cliente: Number(form.cliente),
        keycloak_id: form.keycloak_id.trim(),
        username: form.username.trim(),
        email: form.email.trim(),
      })
      setAsocs(prev => [...prev, creada])
      setAviso(`${creada.username || creada.email} quedó asociado a ${creada.cliente_nombre}.`)
      setShowModal(false)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'No se pudo crear la asociación.')
    } finally {
      setGuardando(false)
    }
  }

  const deleteAsoc = async (id: number) => {
    try {
      await eliminarAsociacion(id)
      setAsocs(prev => prev.filter(a => a.id !== id))
      setAviso('La asociación quedó eliminada.')
    } catch (err) {
      setAviso(err instanceof Error ? err.message : 'No se pudo eliminar la asociación.')
    }
    setDeleteConfirm(null)
  }

  const totalUsuarios = new Set(asocs.map(a => a.keycloak_id)).size

  return (
    <div className="space-y-5 animate-fadein">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Usuarios asociados', value: totalUsuarios, color: '#0f3460' },
          { label: 'Asociaciones', value: asocs.length, color: '#10b981' },
          { label: 'Clientes con usuarios', value: new Set(asocs.map(a => a.cliente)).size, color: '#8b5cf6' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
            <div className="font-mono font-bold text-2xl" style={{ color: s.color }}>{s.value}</div>
            <div className="text-[11px] text-slate-400 font-medium mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-[13px] text-blue-800">
        Las cuentas de acceso y los roles se administran en <strong>Keycloak</strong>. Aquí se gestiona qué usuarios pueden operar en nombre de cada cliente.
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar usuario..." className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-[13px] text-slate-700 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-300 placeholder:text-slate-300" />
        </div>
        <select value={filterClient} onChange={e => setFilterClient(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-[13px] font-medium text-slate-700 bg-white focus:outline-none">
          <option value="Todos">Todos los clientes</option>
          {clientes.map(c => <option key={c.id} value={c.nombre}>{c.nombre}</option>)}
        </select>
        <button onClick={openCreate} className="ml-auto flex items-center gap-1.5 px-4 py-2 rounded-lg text-white text-[13px] font-semibold transition-all hover:-translate-y-0.5" style={{ background: 'linear-gradient(135deg,#0f3460,#10b981)' }}>
          + Asociar usuario
        </button>
      </div>

      {aviso && (
        <div role="status" className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-[13px] text-slate-600">
          {aviso}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        {cargando ? (
          <div className="p-16 text-center text-slate-400 text-[14px]">Cargando asociaciones…</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60">
                {['Usuario', 'Cliente', 'Sub de Keycloak', 'Acciones'].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map(a => (
                <tr key={a.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0" style={{ background: 'linear-gradient(135deg,#132952,#10b981)' }}>
                        {(a.username || a.email).charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-semibold text-slate-900 text-[14px]">{a.username || '(sin nombre)'}</div>
                        <div className="text-[12px] text-slate-400">{a.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-[13px] text-slate-600 font-medium">{a.cliente_nombre}</td>
                  <td className="px-5 py-4 text-[12px] font-mono text-slate-400">{a.keycloak_id.slice(0, 8)}…</td>
                  <td className="px-5 py-4">
                    <button onClick={() => setDeleteConfirm(a.id)} className="text-[12px] font-semibold text-slate-500 hover:text-red-500 px-2 py-1 rounded hover:bg-red-50 transition-colors">Desvincular</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!cargando && filtered.length === 0 && (
          <div className="p-16 text-center">
            <div className="text-5xl mb-4">👥</div>
            <h3 className="font-bold text-slate-900 text-xl mb-2" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Sin asociaciones</h3>
            <p className="text-slate-400 text-[14px] mb-6">Asociá usuarios de Keycloak a los clientes para que puedan operar en su nombre</p>
            <button onClick={openCreate} className="px-4 py-2 rounded-lg text-white text-[13px] font-semibold" style={{ background: '#0f3460' }}>
              + Asociar usuario
            </button>
          </div>
        )}
      </div>

      {/* Delete confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm animate-fadein text-center">
            <div className="text-4xl mb-4">⚠️</div>
            <h3 className="font-bold text-slate-900 text-lg mb-2" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Desvincular usuario</h3>
            <p className="text-slate-500 text-[14px] mb-6">El usuario pierde el acceso a operar en nombre de este cliente. La cuenta de Keycloak no se elimina.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-[14px] font-semibold text-slate-700 hover:bg-slate-50">Cancelar</button>
              <button onClick={() => deleteAsoc(deleteConfirm)} className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-[14px] font-semibold hover:bg-red-600">Desvincular</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md animate-fadein" onClick={e => e.stopPropagation()}>
            <h2 className="font-bold text-slate-900 text-lg mb-6" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
              Asociar usuario a cliente
            </h2>
            <div className="space-y-4">
              <div>
                <label htmlFor="asoc-client" className="block text-[12px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Cliente</label>
                <select id="asoc-client" value={form.cliente} onChange={e => setField('cliente', e.target.value)} className="w-full border border-slate-200 rounded-xl px-4 py-3 text-[14px] text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300">
                  <option value="">Seleccionar…</option>
                  {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="asoc-sub" className="block text-[12px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Sub de Keycloak</label>
                <input id="asoc-sub" value={form.keycloak_id} onChange={e => setField('keycloak_id', e.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" className="w-full border border-slate-200 rounded-xl px-4 py-3 text-[14px] font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                <p className="text-[12px] text-slate-400 mt-1">Identificador del usuario en Keycloak (claim “sub” del token).</p>
              </div>
              <div>
                <label htmlFor="asoc-username" className="block text-[12px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Nombre de usuario</label>
                <input id="asoc-username" value={form.username} onChange={e => setField('username', e.target.value)} placeholder="Nombre Apellido" className="w-full border border-slate-200 rounded-xl px-4 py-3 text-[14px] text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-300" />
              </div>
              <div>
                <label htmlFor="asoc-email" className="block text-[12px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Correo electrónico</label>
                <input id="asoc-email" value={form.email} onChange={e => setField('email', e.target.value)} placeholder="usuario@email.com" type="email" className="w-full border border-slate-200 rounded-xl px-4 py-3 text-[14px] text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-300" />
              </div>
              {formError && <p role="alert" className="text-red-500 text-[13px]">{formError}</p>}
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowModal(false)} className="flex-1 py-3 rounded-xl border border-slate-200 text-[14px] font-semibold text-slate-700 hover:bg-slate-50">Cancelar</button>
              <button onClick={saveAsoc} disabled={guardando} className="flex-1 py-3 rounded-xl text-white text-[14px] font-semibold disabled:opacity-60" style={{ background: 'linear-gradient(135deg,#0f3460,#10b981)' }}>
                {guardando ? 'Guardando…' : 'Asociar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
