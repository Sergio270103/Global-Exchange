import { useState } from 'react'

const roles = ['Administrador', 'Analista Cambiario', 'Usuario', 'No Registrado']

const permissionGroups = [
  {
    group: 'Tasas de cambio',
    permissions: [
      { key: 'rates.view', label: 'Ver tasas públicas', defaults: [true, true, true, true] },
      { key: 'rates.history', label: 'Ver historial de tasas', defaults: [true, true, true, true] },
      { key: 'rates.edit', label: 'Editar tasas', defaults: [true, true, false, false] },
    ],
  },
  {
    group: 'Operaciones',
    permissions: [
      { key: 'ops.buy', label: 'Comprar divisas', defaults: [true, false, true, false] },
      { key: 'ops.sell', label: 'Vender divisas', defaults: [true, false, true, false] },
      { key: 'ops.simulate', label: 'Simular conversión', defaults: [true, true, true, true] },
    ],
  },
  {
    group: 'Billeteras y cuentas',
    permissions: [
      { key: 'wallet.view', label: 'Ver billeteras', defaults: [true, false, true, false] },
      { key: 'wallet.deposit', label: 'Depositar fondos', defaults: [true, false, true, false] },
      { key: 'wallet.withdraw', label: 'Retirar fondos', defaults: [true, false, true, false] },
      { key: 'bank.view', label: 'Ver cuentas bancarias', defaults: [true, false, true, false] },
      { key: 'bank.add', label: 'Agregar cuentas bancarias', defaults: [true, false, true, false] },
    ],
  },
  {
    group: 'Reportes y análisis',
    permissions: [
      { key: 'report.transactions', label: 'Ver historial de transacciones', defaults: [true, true, true, false] },
      { key: 'report.earnings', label: 'Ver ganancias', defaults: [true, true, false, false] },
      { key: 'report.invoices', label: 'Ver facturas', defaults: [true, false, true, false] },
      { key: 'report.export', label: 'Exportar reportes (PDF/Excel)', defaults: [true, true, true, false] },
    ],
  },
  {
    group: 'Administración',
    permissions: [
      { key: 'admin.clients', label: 'Gestionar clientes', defaults: [true, false, false, false] },
      { key: 'admin.users', label: 'Gestionar usuarios', defaults: [true, false, false, false] },
      { key: 'admin.roles', label: 'Gestionar roles y permisos', defaults: [true, false, false, false] },
      { key: 'admin.currencies', label: 'Gestionar monedas', defaults: [true, false, false, false] },
      { key: 'admin.config', label: 'Configuración del sistema', defaults: [true, false, false, false] },
    ],
  },
]

type PermMatrix = Record<string, boolean[]>

export default function RolesPermissions() {
  const [matrix, setMatrix] = useState<PermMatrix>(() => {
    const m: PermMatrix = {}
    permissionGroups.forEach(g => g.permissions.forEach(p => { m[p.key] = [...p.defaults] }))
    return m
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const toggle = (key: string, roleIdx: number) => {
    if (roleIdx === 0) return // Admin always has all permissions
    setMatrix(prev => ({ ...prev, [key]: prev[key].map((v, i) => i === roleIdx ? !v : v) }))
    setSaved(false)
  }

  const save = () => {
    setSaving(true)
    setTimeout(() => { setSaving(false); setSaved(true) }, 800)
  }

  const roleColors = ['#f59e0b', '#8b5cf6', '#10b981', '#94a3b8']

  return (
    <div className="space-y-5 animate-fadein">
      <div className="flex items-center justify-between bg-white rounded-xl border border-slate-100 shadow-sm p-5">
        <div>
          <h3 className="font-semibold text-slate-800 text-[15px]" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Matriz de roles y permisos</h3>
          <p className="text-[12px] text-slate-400 mt-0.5">Los permisos del Administrador no pueden modificarse</p>
        </div>
        <div className="flex items-center gap-3">
          {saved && <span className="text-[13px] text-emerald-600 font-semibold animate-fadein">✓ Cambios guardados</span>}
          <button onClick={save} disabled={saving} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-[13px] font-semibold transition-all hover:-translate-y-0.5 hover:shadow-md disabled:opacity-70" style={{ background: 'linear-gradient(135deg,#0f3460,#10b981)' }}>
            {saving ? '⏳ Guardando...' : '💾 Guardar permisos'}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60">
                <th className="px-5 py-4 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider w-64">Permiso</th>
                {roles.map((role, i) => (
                  <th key={role} className="px-5 py-4 text-center min-w-[140px]">
                    <div className="inline-flex flex-col items-center gap-1.5">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold" style={{ backgroundColor: roleColors[i] }}>
                        {role.charAt(0)}
                      </div>
                      <span className="text-[11px] font-semibold text-slate-600 whitespace-nowrap">{role}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {permissionGroups.map(group => (
                <>
                  <tr key={group.group} className="bg-slate-50/40">
                    <td colSpan={roles.length + 1} className="px-5 py-2.5">
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{group.group}</span>
                    </td>
                  </tr>
                  {group.permissions.map(perm => (
                    <tr key={perm.key} className="border-b border-slate-50 hover:bg-slate-50/40 transition-colors">
                      <td className="px-5 py-3.5 text-[13px] text-slate-700 font-medium">{perm.label}</td>
                      {roles.map((_, roleIdx) => {
                        const enabled = matrix[perm.key]?.[roleIdx] ?? false
                        const isAdmin = roleIdx === 0
                        return (
                          <td key={roleIdx} className="px-5 py-3.5 text-center">
                            <button
                              onClick={() => toggle(perm.key, roleIdx)}
                              disabled={isAdmin}
                              className={`w-9 h-5 rounded-full transition-all duration-200 relative ${enabled ? 'bg-emerald-500' : 'bg-slate-200'} ${isAdmin ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:opacity-80'}`}
                            >
                              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all duration-200 ${enabled ? 'left-[calc(100%-18px)]' : 'left-0.5'}`}/>
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Role legend */}
      <div className="grid grid-cols-4 gap-4">
        {roles.map((role, i) => {
          const totalEnabled = Object.values(matrix).filter(v => v[i]).length
          const totalPerms = Object.keys(matrix).length
          return (
            <div key={role} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-6 h-6 rounded-lg flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: roleColors[i] }}>{role.charAt(0)}</div>
                <span className="font-semibold text-slate-800 text-[13px]">{role}</span>
              </div>
              <div className="text-[11px] text-slate-400 mb-2">{totalEnabled} / {totalPerms} permisos activos</div>
              <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${(totalEnabled / totalPerms) * 100}%`, backgroundColor: roleColors[i] }}/>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
