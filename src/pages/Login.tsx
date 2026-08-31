import { useState } from 'react'
import { type Page, type AuthUser, type Role } from '@/types'

interface LoginProps {
  navigate: (p: Page) => void
  onLogin: (user: AuthUser) => void
}

const demoAccounts: { role: Role; name: string; email: string; label: string; color: string }[] = [
  { role: 'user', name: 'Carlos Martínez', email: 'carlos@email.com', label: 'Usuario registrado', color: '#10b981' },
  { role: 'analyst', name: 'Juan Analista', email: 'juan@globalexchange.com', label: 'Analista Cambiario', color: '#3b82f6' },
  { role: 'admin', name: 'María García', email: 'maria@globalexchange.com', label: 'Administrador', color: '#f59e0b' },
]

export default function Login({ navigate, onLogin }: LoginProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(false)
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) { setError('Completá todos los campos'); return }
    setLoading(true)
    setError('')
    setTimeout(() => {
      onLogin({ name: 'Carlos Martínez', email, role: 'user', avatar: '' })
      setLoading(false)
    }, 800)
  }

  const quickLogin = (account: typeof demoAccounts[0]) => {
    setLoading(true)
    setTimeout(() => {
      onLogin({ name: account.name, email: account.email, role: account.role, avatar: '' })
      setLoading(false)
    }, 600)
  }

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: '#f0f4f8' }}>
      {/* Left panel */}
      <div className="hidden lg:flex flex-col justify-between w-[480px] shrink-0 p-12" style={{ background: 'linear-gradient(160deg,#050d1a,#0a1628,#0f3460)' }}>
        <div>
          <div className="flex items-center gap-2.5 mb-16">
            <div className="w-9 h-9 rounded-xl text-white font-bold text-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#10b981,#0ea5e9)', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>G</div>
            <span className="text-white font-bold text-[17px]" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Global Exchange</span>
          </div>
          <h2 className="text-4xl font-extrabold text-white mb-4 leading-tight" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
            Tu plataforma<br/>de divisas<br/>profesional.
          </h2>
          <p className="text-slate-400 text-[15px] leading-relaxed">Comprá y vendé divisas al mejor tipo de cambio, con seguridad de nivel bancario.</p>
        </div>

        {/* Demo accounts */}
        <div>
          <p className="text-slate-500 text-[12px] uppercase tracking-wider font-semibold mb-4">Acceso rápido para demo</p>
          <div className="space-y-2.5">
            {demoAccounts.map(acc => (
              <button
                key={acc.role}
                onClick={() => quickLogin(acc)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all hover:bg-white/5 text-left"
                style={{ borderColor: `${acc.color}33` }}
              >
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0" style={{ background: acc.color }}>
                  {acc.name.charAt(0)}
                </div>
                <div>
                  <div className="text-white text-[13px] font-semibold">{acc.name}</div>
                  <div className="text-[11px] font-medium" style={{ color: acc.color }}>{acc.label}</div>
                </div>
                <span className="ml-auto text-slate-600 text-sm">→</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="flex items-center gap-2.5 mb-10 lg:hidden">
            <div className="w-9 h-9 rounded-xl text-white font-bold text-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#10b981,#0ea5e9)', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>G</div>
            <span className="font-bold text-slate-800 text-[17px]" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Global Exchange</span>
          </div>

          <h1 className="text-2xl font-bold text-slate-900 mb-2" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Iniciar sesión</h1>
          <p className="text-slate-500 text-[14px] mb-8">Ingresá tus credenciales para acceder a tu cuenta.</p>

          {/* Demo quick access (mobile) */}
          <div className="lg:hidden mb-6 p-4 rounded-xl bg-slate-50 border border-slate-200">
            <p className="text-[12px] text-slate-400 font-semibold uppercase tracking-wider mb-3">Acceso rápido para demo</p>
            <div className="flex gap-2 flex-wrap">
              {demoAccounts.map(acc => (
                <button key={acc.role} onClick={() => quickLogin(acc)} className="text-[12px] px-3 py-1.5 rounded-lg text-white font-medium transition-opacity hover:opacity-80" style={{ background: acc.color }}>
                  {acc.label}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            {error && (
              <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-3 text-[13px]">
                <span>⚠️</span> {error}
              </div>
            )}
            <div>
              <label htmlFor="email" className="block text-[12px] font-semibold text-slate-600 uppercase tracking-wider mb-2">Correo electrónico</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="tu@correo.com"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-800 text-[14px] focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400 transition-all placeholder:text-slate-300"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-[12px] font-semibold text-slate-600 uppercase tracking-wider mb-2">Contraseña</label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-800 text-[14px] focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400 transition-all placeholder:text-slate-300"
                />
                <button type="button" onClick={() => setShowPassword(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-[12px]">
                  {showPassword ? 'Ocultar' : 'Mostrar'}
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} className="w-4 h-4 rounded accent-emerald-500"/>
                <span className="text-[13px] text-slate-600 font-medium">Recordarme</span>
              </label>
              <button type="button" className="text-[13px] font-semibold text-emerald-600 hover:text-emerald-700">
                ¿Olvidaste tu contraseña?
              </button>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl text-white font-semibold text-[15px] transition-all hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-70 disabled:cursor-not-allowed"
              style={{ background: 'linear-gradient(135deg,#0f3460,#10b981)' }}
            >
              {loading ? 'Iniciando sesión...' : 'Iniciar sesión'}
            </button>
          </form>

          <p className="text-center text-[13px] text-slate-500 mt-8">
            ¿No tenés cuenta?{' '}
            <button onClick={() => navigate('register')} className="text-emerald-600 font-semibold hover:text-emerald-700">
              Registrarse gratis
            </button>
          </p>
          <p className="text-center text-[11px] text-slate-400 mt-6">
            © 2024 Global Exchange S.A. · Regulado por el BCP
          </p>
        </div>
      </div>
    </div>
  )
}
