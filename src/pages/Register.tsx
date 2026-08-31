import { useState } from 'react'
import { type Page } from '@/types'

interface RegisterProps {
  navigate: (p: Page) => void
}

interface FieldProps {
  label: string
  name: string
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  error?: string
  type?: string
  placeholder?: string
}

const Field = ({ label, name, type = 'text', placeholder, value, onChange, error }: FieldProps) => (
  <div>
    <label htmlFor={name} className="block text-[12px] font-semibold text-slate-600 uppercase tracking-wider mb-1.5">{label}</label>
    <input
      id={name}
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className={`w-full px-4 py-3 rounded-xl border text-slate-800 text-[14px] bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300 transition-all placeholder:text-slate-300 ${error ? 'border-red-300 bg-red-50/30' : 'border-slate-200'}`}
    />
    {error && <p className="text-red-500 text-[11px] mt-1">{error}</p>}
  </div>
)

export default function Register({ navigate }: RegisterProps) {
  const [clientType, setClientType] = useState<'fisica' | 'juridica'>('fisica')
  const [form, setForm] = useState({ nombre: '', apellido: '', correo: '', telefono: '', documento: '', password: '', confirm: '', empresa: '' })
  const [terms, setTerms] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const validate = () => {
    const e: Record<string, string> = {}
    if (!form.nombre) e.nombre = 'Requerido'
    if (clientType === 'fisica' && !form.apellido) e.apellido = 'Requerido'
    if (clientType === 'juridica' && !form.empresa) e.empresa = 'Requerido'
    if (!form.correo || !form.correo.includes('@')) e.correo = 'Correo inválido'
    if (!form.telefono) e.telefono = 'Requerido'
    if (!form.documento) e.documento = 'Requerido'
    if (!form.password || form.password.length < 8) e.password = 'Mínimo 8 caracteres'
    if (form.password !== form.confirm) e.confirm = 'Las contraseñas no coinciden'
    if (!terms) e.terms = 'Debés aceptar los términos'
    return e
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setLoading(true)
    setTimeout(() => { setLoading(false); setSubmitted(true) }, 1200)
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6" style={{ background: 'linear-gradient(135deg,#f0f4f8,#e8f4f0)' }}>
        <div className="text-center max-w-md">
          <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-6 text-4xl">✉️</div>
          <h2 className="text-2xl font-bold text-slate-900 mb-3" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Verificá tu correo electrónico</h2>
          <p className="text-slate-500 text-[15px] mb-2">Enviamos un enlace de verificación a</p>
          <p className="text-emerald-600 font-semibold mb-6">{form.correo}</p>
          <p className="text-slate-400 text-[13px] mb-8 leading-relaxed">Hacé clic en el enlace del correo para activar tu cuenta. Si no lo ves, revisá tu carpeta de spam.</p>
          <button onClick={() => navigate('login')} className="px-8 py-3 rounded-xl text-white font-semibold" style={{ background: 'linear-gradient(135deg,#0f3460,#10b981)' }}>
            Ir al inicio de sesión
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-start justify-center py-12 px-4" style={{ backgroundColor: '#f0f4f8' }}>
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2.5 mb-6">
            <div className="w-9 h-9 rounded-xl text-white font-bold text-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#10b981,#0ea5e9)', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>G</div>
            <span className="font-bold text-slate-800 text-[17px]" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Global Exchange</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Crear cuenta</h1>
          <p className="text-slate-500 text-[14px]">Completá el formulario para empezar a operar</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8">
          {/* Client type toggle */}
          <div className="flex rounded-xl border border-slate-200 p-1 mb-8">
            {(['fisica', 'juridica'] as const).map(t => (
              <button
                key={t}
                onClick={() => setClientType(t)}
                className={`flex-1 py-2.5 rounded-lg text-[13px] font-semibold transition-all ${clientType === t ? 'bg-[#0f3460] text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                {t === 'fisica' ? '👤 Persona Física' : '🏢 Persona Jurídica'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            {clientType === 'juridica' && (
              <Field label="Razón Social / Empresa" name="empresa" value={form.empresa} onChange={e => set('empresa', e.target.value)} placeholder="Mi Empresa S.A." error={errors.empresa}/>
            )}

            <div className="grid sm:grid-cols-2 gap-5">
              <Field label={clientType === 'juridica' ? 'Nombre del representante' : 'Nombre'} name="nombre" value={form.nombre} onChange={e => set('nombre', e.target.value)} placeholder="Carlos" error={errors.nombre}/>
              {clientType === 'fisica' && <Field label="Apellido" name="apellido" value={form.apellido} onChange={e => set('apellido', e.target.value)} placeholder="Martínez" error={errors.apellido}/>}
            </div>

            <div className="grid sm:grid-cols-2 gap-5">
              <Field label="Correo electrónico" name="correo" type="email" value={form.correo} onChange={e => set('correo', e.target.value)} placeholder="tu@correo.com" error={errors.correo}/>
              <Field label="Teléfono" name="telefono" value={form.telefono} onChange={e => set('telefono', e.target.value)} placeholder="+595 981 000 000" error={errors.telefono}/>
            </div>

            <Field label={clientType === 'juridica' ? 'RUC' : 'Cédula de identidad'} name="documento" value={form.documento} onChange={e => set('documento', e.target.value)} placeholder={clientType === 'juridica' ? '80-123456-7' : '1.234.567-8'} error={errors.documento}/>

            <div className="grid sm:grid-cols-2 gap-5">
              <div>
                <label htmlFor="password" className="block text-[12px] font-semibold text-slate-600 uppercase tracking-wider mb-1.5">Contraseña</label>
                <input
                  id="password"
                  type="password"
                  value={form.password}
                  onChange={e => set('password', e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  className={`w-full px-4 py-3 rounded-xl border text-slate-800 text-[14px] bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300 placeholder:text-slate-300 ${errors.password ? 'border-red-300' : 'border-slate-200'}`}
                />
                {errors.password && <p className="text-red-500 text-[11px] mt-1">{errors.password}</p>}
                {form.password && (
                  <div className="mt-2 h-1 rounded-full bg-slate-100">
                    <div
                      className="h-1 rounded-full transition-all"
                      style={{ width: `${Math.min(100, (form.password.length / 12) * 100)}%`, background: form.password.length < 8 ? '#ef4444' : form.password.length < 10 ? '#f59e0b' : '#10b981' }}
                    />
                  </div>
                )}
              </div>
              <div>
                <label htmlFor="confirm" className="block text-[12px] font-semibold text-slate-600 uppercase tracking-wider mb-1.5">Confirmar contraseña</label>
                <input
                  id="confirm"
                  type="password"
                  value={form.confirm}
                  onChange={e => set('confirm', e.target.value)}
                  placeholder="Repetí tu contraseña"
                  className={`w-full px-4 py-3 rounded-xl border text-slate-800 text-[14px] bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300 placeholder:text-slate-300 ${errors.confirm ? 'border-red-300' : 'border-slate-200'}`}
                />
                {errors.confirm && <p className="text-red-500 text-[11px] mt-1">{errors.confirm}</p>}
              </div>
            </div>

            <label className={`flex items-start gap-3 cursor-pointer p-3 rounded-xl border transition-colors ${errors.terms ? 'border-red-200 bg-red-50/30' : 'border-slate-100 bg-slate-50 hover:bg-slate-100'}`}>
              <input type="checkbox" checked={terms} onChange={e => setTerms(e.target.checked)} className="mt-0.5 w-4 h-4 rounded accent-emerald-500"/>
              <span className="text-[13px] text-slate-600 leading-relaxed">
                Acepto los{' '}
                <a href="#" className="text-emerald-600 font-semibold hover:underline">Términos y condiciones de uso</a>
                {' '}y la{' '}
                <a href="#" className="text-emerald-600 font-semibold hover:underline">Política de privacidad</a>
              </span>
            </label>
            {errors.terms && <p className="text-red-500 text-[11px] -mt-3">{errors.terms}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl text-white font-semibold text-[15px] transition-all hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-70 disabled:cursor-not-allowed"
              style={{ background: 'linear-gradient(135deg,#0f3460,#10b981)' }}
            >
              {loading ? 'Creando cuenta...' : 'Crear cuenta'}
            </button>
          </form>
        </div>

        <p className="text-center text-[13px] text-slate-500 mt-6">
          ¿Ya tenés cuenta?{' '}
          <button onClick={() => navigate('login')} className="text-emerald-600 font-semibold hover:text-emerald-700">
            Iniciar sesión
          </button>
        </p>
      </div>
    </div>
  )
}
