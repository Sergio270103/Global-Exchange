import { useState } from 'react'
import { exchangeRates } from '@/data/mockData'
import { type Page } from '@/types'
import keycloak from '../keycloak';

console.log('Keycloak:', keycloak);

const faqs = [
  { q: '¿Cómo funciona el proceso de compra?', a: 'Seleccionás la divisa que deseás comprar, ingresás el monto, confirmás la transacción y el importe se acredita automáticamente en tu billetera digital en minutos.' },
  { q: '¿Las tasas se actualizan en tiempo real?', a: 'Sí. Nuestros analistas cambiarios monitorean el mercado continuamente y actualizan las tasas varias veces al día para ofrecerte el mejor tipo de cambio disponible.' },
  { q: '¿Cómo puedo retirar mis fondos?', a: 'Podés retirar tus fondos mediante transferencia bancaria a cualquiera de tus cuentas registradas. El proceso es inmediato para las cuentas verificadas.' },
  { q: '¿Qué documentos necesito para registrarme?', a: 'Para personas físicas: Cédula de identidad. Para empresas: RUC, estatutos y documentación del representante legal.' },
  { q: '¿Hay comisiones ocultas?', a: 'No. El diferencial entre el precio de compra y venta es nuestra única forma de remuneración. Lo que ves en pantalla es lo que pagás.' },
]

const steps = [
  { number: '01', title: 'Creá tu cuenta', desc: 'Registro en menos de 5 minutos. Solo necesitás tu correo y documento de identidad.' },
  { number: '02', title: 'Verificá tu identidad', desc: 'Proceso KYC rápido y seguro. Tu información está cifrada y protegida.' },
  { number: '03', title: 'Operá al instante', desc: 'Comprá y vendé divisas al mejor tipo de cambio del mercado, en tiempo real.' },
]

const benefits = [
  { icon: '🔒', title: 'Seguridad de nivel bancario', desc: 'Cifrado AES-256, autenticación de dos factores y monitoreo 24/7.' },
  { icon: '⚡', title: 'Operaciones instantáneas', desc: 'Tus fondos se acreditan en minutos, no en días hábiles.' },
  { icon: '📊', title: 'Transparencia total', desc: 'Sin comisiones ocultas. Tasas en tiempo real y comprobantes digitales.' },
  { icon: '🌐', title: 'Múltiples divisas', desc: 'USD, EUR, BRL, ARS, GBP y más. Todo desde una sola plataforma.' },
  { icon: '📱', title: 'Desde cualquier dispositivo', desc: 'Plataforma 100% web, optimizada para escritorio, tablet y móvil.' },
  { icon: '🏆', title: 'Respaldo institucional', desc: 'Empresa regulada con más de 10 años de trayectoria en el mercado.' },
]

const currencies = ['🇺🇸 USD', '🇪🇺 EUR', '🇧🇷 BRL', '🇦🇷 ARS', '🇵🇾 PYG', '🇬🇧 GBP', '🇨🇱 CLP', '🇺🇾 UYP', '🇨🇴 COP', '🇵🇪 PEN', '🇧🇴 BOB', '🇨🇭 CHF']

interface LandingProps {
  navigate: (p: Page) => void
}

export default function Landing({ navigate }: LandingProps) {
  const [openFaq, setOpenFaq] = useState<number | null>(null)
  const [simFrom, setSimFrom] = useState('USD')
  const [simTo, setSimTo] = useState('PYG')
  const [simAmount, setSimAmount] = useState('1000')
  const [simResult, setSimResult] = useState<{ rate: number; converted: number; commission: number } | null>(null)

  const currencyOptions = exchangeRates.map(r => r.currency).concat(['PYG'])

  const simulate = () => {
    const amount = parseFloat(simAmount) || 0
    const rate = exchangeRates.find(r => r.currency === simFrom)?.sell || 7650
    const converted = amount * rate
    const commission = converted * 0.001
    setSimResult({ rate, converted, commission })
  }

  const tickerRates = [...exchangeRates, ...exchangeRates]

  return (
    <div className="min-h-screen" style={{ fontFamily: 'Inter, sans-serif' }}>

      {/* Topbar */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200/60">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center gap-6">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-base" style={{ background: 'linear-gradient(135deg,#10b981,#0ea5e9)', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>G</div>
            <span className="font-bold text-slate-800 text-[16px]" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Global Exchange</span>
          </div>
          <nav className="hidden md:flex items-center gap-6 ml-8">
            {['Inicio', 'Tasas', 'Cómo funciona', 'Beneficios', 'FAQ'].map(item => (
              <a key={item} href={`#${item.toLowerCase().replace(' ', '-')}`} className="text-[13px] font-medium text-slate-600 hover:text-emerald-600 transition-colors">{item}</a>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <button onClick={() => keycloak.login()} className="text-[13px] font-semibold text-slate-700 hover:text-slate-900 transition-colors px-3 py-1.5">
              Iniciar sesión
            </button>
            <button
              onClick={() => keycloak.register()}
              className="text-[13px] font-semibold text-white px-4 py-2 rounded-lg transition-all hover:shadow-md hover:-translate-y-0.5"
              style={{ background: 'linear-gradient(135deg,#0f3460,#10b981)' }}
            >
              Registrarse
            </button>
          </div>
        </div>
      </div>

      {/* Hero */}
      <section className="relative min-h-screen flex flex-col justify-center overflow-hidden pt-16" style={{ background: 'linear-gradient(135deg, #050d1a 0%, #0a1628 50%, #0f2040 100%)' }}>
        {/* Grid overlay */}
        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.4) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.4) 1px,transparent 1px)', backgroundSize: '48px 48px' }}/>
        {/* Glow blobs */}
        <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] rounded-full opacity-[0.08]" style={{ background: 'radial-gradient(circle,#10b981,transparent)' }}/>
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] rounded-full opacity-[0.06]" style={{ background: 'radial-gradient(circle,#3b82f6,transparent)' }}/>

        <div className="relative max-w-7xl mx-auto px-6 py-24 grid lg:grid-cols-2 gap-16 items-center">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 mb-8">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse-slow"/>
              <span className="text-emerald-400 text-[12px] font-semibold uppercase tracking-wider">Tasas actualizadas en tiempo real</span>
            </div>
            <h1 className="text-5xl lg:text-6xl font-extrabold leading-tight mb-6" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif', color: '#fff' }}>
              Cambiá divisas<br/>
              <span style={{ background: 'linear-gradient(90deg, #10b981, #34d399)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                al mejor precio.
              </span>
            </h1>
            <p className="text-slate-400 text-[16px] leading-relaxed mb-10 max-w-lg">
              La plataforma fintech líder en Paraguay para compra y venta de divisas. USD, EUR, BRL y más, al tipo de cambio más competitivo del mercado.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => keycloak.register()}
                className="px-7 py-3.5 rounded-xl text-white font-semibold text-[15px] transition-all hover:-translate-y-0.5 hover:shadow-xl"
                style={{ background: 'linear-gradient(135deg,#10b981,#059669)' }}
              >
                Empezar ahora →
              </button>
              <button
                onClick={() => { const el = document.getElementById('simulator'); el?.scrollIntoView({ behavior: 'smooth' }) }}
                className="px-7 py-3.5 rounded-xl font-semibold text-[15px] border transition-all hover:bg-white/5"
                style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.2)' }}
              >
                Simular conversión
              </button>
            </div>
            <div className="flex items-center gap-8 mt-12">
              {[['+10 años', 'de trayectoria'], ['$2.5B+', 'operados anual'], ['50K+', 'clientes activos']].map(([v, l]) => (
                <div key={v}>
                  <div className="text-2xl font-bold text-white" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>{v}</div>
                  <div className="text-slate-500 text-[12px]">{l}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Rate card preview */}
          <div className="hidden lg:block">
            <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-6">
              <div className="flex items-center justify-between mb-5">
                <span className="text-white font-semibold text-[15px]" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Tasas del día</span>
                <span className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse-slow inline-block"/>
                  EN VIVO
                </span>
              </div>
              {exchangeRates.slice(0, 4).map(r => (
                <div key={r.currency} className="flex items-center justify-between py-3 border-b border-white/5 last:border-0">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{r.flag}</span>
                    <div>
                      <div className="text-white text-[14px] font-semibold">{r.currency}</div>
                      <div className="text-slate-500 text-[11px]">{r.name}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-white font-mono font-semibold text-[14px]">₲ {r.sell.toLocaleString()}</div>
                    <div className={`text-[11px] font-semibold ${r.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {r.change >= 0 ? '▲' : '▼'} {Math.abs(r.change)}%
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Ticker */}
        <div className="relative border-t border-white/5 bg-white/3 overflow-hidden">
          <div className="flex animate-ticker py-3">
            {tickerRates.map((r, i) => (
              <div key={i} className="flex items-center gap-3 mx-8 shrink-0">
                <span className="text-base">{r.flag}</span>
                <span className="text-slate-400 text-[13px] font-medium">{r.currency}</span>
                <span className="text-white font-mono font-semibold text-[13px]">₲ {r.sell.toLocaleString()}</span>
                <span className={`text-[11px] font-semibold ${r.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {r.change >= 0 ? '+' : ''}{r.change}%
                </span>
                <span className="text-white/10 mx-2">|</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Rates section */}
      <section id="tasas" className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-slate-900 mb-3" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Tasas de cambio en tiempo real</h2>
            <p className="text-slate-500">Actualizadas durante todo el día hábil por nuestros analistas</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {exchangeRates.map(r => (
              <div key={r.currency} className="rounded-xl border border-slate-100 bg-white shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{r.flag}</span>
                    <div>
                      <div className="font-bold text-slate-900 text-[15px]" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>{r.currency}</div>
                      <div className="text-slate-400 text-[11px]">{r.name}</div>
                    </div>
                  </div>
                  <span className={`text-[12px] font-bold px-2 py-0.5 rounded-full ${r.change >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'}`}>
                    {r.change >= 0 ? '▲' : '▼'} {Math.abs(r.change)}%
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-50 rounded-lg p-3">
                    <div className="text-[11px] text-slate-400 font-medium mb-1">COMPRA</div>
                    <div className="font-mono font-bold text-slate-800 text-[15px]">₲ {r.buy.toLocaleString()}</div>
                  </div>
                  <div className="bg-emerald-50 rounded-lg p-3">
                    <div className="text-[11px] text-emerald-600 font-medium mb-1">VENTA</div>
                    <div className="font-mono font-bold text-emerald-700 text-[15px]">₲ {r.sell.toLocaleString()}</div>
                  </div>
                </div>
                <div className="mt-3 text-[11px] text-slate-300 text-right">Act. {r.updatedAt}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="cómo-funciona" className="py-20" style={{ background: '#f0f4f8' }}>
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold text-slate-900 mb-3" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>¿Cómo funciona?</h2>
            <p className="text-slate-500">Tres pasos simples para operar con divisas</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {steps.map((s, i) => (
              <div key={i} className="relative text-center">
                {i < steps.length - 1 && (
                  <div className="hidden md:block absolute top-8 left-[calc(50%+40px)] right-[-calc(50%-40px)] h-px bg-slate-200"/>
                )}
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5 font-bold text-xl" style={{ background: 'linear-gradient(135deg,#0f3460,#10b981)', color: '#fff', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
                  {s.number}
                </div>
                <h3 className="font-bold text-slate-900 text-lg mb-2" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>{s.title}</h3>
                <p className="text-slate-500 text-[14px] leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section id="beneficios" className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold text-slate-900 mb-3" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>¿Por qué elegir Global Exchange?</h2>
            <p className="text-slate-500">Tecnología fintech con respaldo institucional</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {benefits.map((b, i) => (
              <div key={i} className="rounded-xl border border-slate-100 p-6 hover:shadow-md hover:-translate-y-0.5 transition-all">
                <div className="text-3xl mb-4">{b.icon}</div>
                <h3 className="font-bold text-slate-900 mb-2 text-[15px]" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>{b.title}</h3>
                <p className="text-slate-500 text-[13px] leading-relaxed">{b.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Currencies */}
      <section className="py-14 bg-slate-50 border-y border-slate-100">
        <div className="max-w-5xl mx-auto px-6 text-center">
          <p className="text-slate-400 text-sm font-semibold uppercase tracking-widest mb-8">Monedas soportadas</p>
          <div className="flex flex-wrap justify-center gap-3">
            {currencies.map(c => (
              <span key={c} className="px-4 py-2 rounded-full bg-white border border-slate-200 text-slate-700 font-medium text-[13px] shadow-sm hover:border-emerald-300 hover:text-emerald-700 transition-colors cursor-default">
                {c}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Simulator */}
      <section id="simulator" className="py-20 bg-white">
        <div className="max-w-2xl mx-auto px-6">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold text-slate-900 mb-3" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Simulador de conversión</h2>
            <p className="text-slate-500">Calculá cuánto recibirás antes de operar</p>
          </div>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-8">
            <div className="grid sm:grid-cols-3 gap-4 mb-6">
              <div>
                <label className="block text-[12px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Tengo (origen)</label>
                <select value={simFrom} onChange={e => setSimFrom(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300">
                  {exchangeRates.map(r => <option key={r.currency} value={r.currency}>{r.flag} {r.currency}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Monto</label>
                <input type="number" value={simAmount} onChange={e => setSimAmount(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-300" placeholder="0.00"/>
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Recibo (destino)</label>
                <select value={simTo} onChange={e => setSimTo(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300">
                  <option value="PYG">🇵🇾 PYG</option>
                  {exchangeRates.filter(r => r.currency !== simFrom).map(r => <option key={r.currency} value={r.currency}>{r.flag} {r.currency}</option>)}
                </select>
              </div>
            </div>
            <button onClick={simulate} className="w-full py-3 rounded-xl text-white font-semibold text-[15px] transition-all hover:-translate-y-0.5 hover:shadow-lg" style={{ background: 'linear-gradient(135deg,#0f3460,#10b981)' }}>
              Simular conversión
            </button>
            {simResult && (
              <div className="mt-6 rounded-xl bg-emerald-50 border border-emerald-100 p-5 animate-fadein">
                <div className="grid grid-cols-3 gap-4 text-center mb-4">
                  <div>
                    <div className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider mb-1">Tasa</div>
                    <div className="font-mono font-bold text-slate-800">₲ {simResult.rate.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider mb-1">Comisión</div>
                    <div className="font-mono font-bold text-slate-800">₲ {simResult.commission.toLocaleString('es', { maximumFractionDigits: 0 })}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-emerald-600 font-semibold uppercase tracking-wider mb-1">Total a recibir</div>
                    <div className="font-mono font-bold text-emerald-700 text-lg">₲ {simResult.converted.toLocaleString('es', { maximumFractionDigits: 0 })}</div>
                  </div>
                </div>
                <button onClick={() => keycloak.register()} className="w-full py-2.5 rounded-lg text-white font-semibold text-[14px]" style={{ background: '#10b981' }}>
                  Comprar ahora →
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-20 bg-slate-50">
        <div className="max-w-3xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-slate-900 mb-3" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Preguntas frecuentes</h2>
          </div>
          <div className="space-y-3">
            {faqs.map((faq, i) => (
              <div key={i} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between px-6 py-4 text-left"
                >
                  <span className="font-semibold text-slate-800 text-[14px]" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>{faq.q}</span>
                  <span className={`text-emerald-500 font-bold text-lg transition-transform duration-200 ${openFaq === i ? 'rotate-45' : ''}`}>+</span>
                </button>
                {openFaq === i && (
                  <div className="px-6 pb-4 animate-fadein">
                    <p className="text-slate-500 text-[14px] leading-relaxed">{faq.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Banner */}
      <section className="py-20" style={{ background: 'linear-gradient(135deg,#0a1628,#0f3460)' }}>
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-3xl font-bold text-white mb-4" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
            ¿Listo para operar al mejor tipo de cambio?
          </h2>
          <p className="text-slate-400 mb-8 text-[15px]">Creá tu cuenta gratis y empezá a cambiar divisas hoy mismo.</p>
          <div className="flex justify-center gap-4 flex-wrap">
            <button onClick={() => keycloak.register()} className="px-8 py-3.5 rounded-xl text-white font-semibold text-[15px] transition-all hover:-translate-y-0.5 hover:shadow-xl" style={{ background: 'linear-gradient(135deg,#10b981,#059669)' }}>
              Crear cuenta gratis
            </button>
            <button onClick={() => keycloak.login()} className="px-8 py-3.5 rounded-xl font-semibold text-[15px] border transition-all hover:bg-white/5" style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.25)' }}>
              Ya tengo cuenta
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ backgroundColor: '#050d1a' }} className="text-slate-500 py-12">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-4 gap-10 mb-10">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 rounded-lg text-white text-sm font-bold flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#10b981,#0ea5e9)', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>G</div>
                <span className="text-white font-bold text-[15px]" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Global Exchange</span>
              </div>
              <p className="text-[13px] leading-relaxed text-slate-500">Plataforma fintech regulada para compra y venta de divisas en Paraguay.</p>
            </div>
            {[
              { title: 'Plataforma', links: ['Dashboard', 'Billeteras', 'Tasas', 'Historial'] },
              { title: 'Empresa', links: ['Sobre nosotros', 'Regulaciones', 'Noticias', 'Contacto'] },
              { title: 'Legal', links: ['Términos de uso', 'Privacidad', 'Cookies', 'AML/KYC'] },
            ].map(col => (
              <div key={col.title}>
                <h4 className="text-white font-semibold text-[13px] mb-4 uppercase tracking-wider">{col.title}</h4>
                <ul className="space-y-2.5">
                  {col.links.map(link => (
                    <li key={link}><a href="#" className="text-[13px] text-slate-500 hover:text-emerald-400 transition-colors">{link}</a></li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="border-t border-white/5 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-[12px]">© 2024 Global Exchange S.A. Todos los derechos reservados.</p>
            <p className="text-[12px]">Regulado por el Banco Central del Paraguay · SEPRELAD</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
