/**
 * Pantalla de retorno desde Stripe Checkout.
 *
 * Stripe redirige a `/?pago=exito|cancelado&op={id}` (ver `App`). Acá se
 * sondea la operación hasta su estado final: la confirmación real viene
 * del webhook, nunca del retorno del navegador. Éxito → ver en el
 * historial; pago incompleto → reintentar desde comprar/vender.
 *
 * @module components/RetornoPago
 */
import { useEffect, useState } from 'react'
import { obtenerOperacion, type Operacion } from '@/services/operaciones'

export interface RetornoPagoProps {
  opId: number
  resultado: 'exito' | 'cancelado'
  onVerHistorial: () => void
  onReintentar: () => void
}

/** Intervalo de sondeo (ms) y reintentos máximos. */
const INTERVALO = 3000
const REINTENTOS_EXITO = 30
const REINTENTOS_CANCELADO = 10

export default function RetornoPago({ opId, resultado, onVerHistorial, onReintentar }: RetornoPagoProps) {
  const [op, setOp] = useState<Operacion | null>(null)
  const [terminado, setTerminado] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let vivo = true
    let timer = 0
    let intentos = 0
    const maximo = resultado === 'exito' ? REINTENTOS_EXITO : REINTENTOS_CANCELADO

    async function sondear(): Promise<void> {
      intentos += 1
      try {
        const actual = await obtenerOperacion(opId)
        if (!vivo) return
        setOp(actual)
        if (actual.estado !== 'PENDIENTE' || intentos >= maximo) {
          setTerminado(true)
          return
        }
      } catch {
        if (!vivo) return
        if (intentos >= maximo) {
          setError('No se pudo verificar el estado del pago.')
          setTerminado(true)
          return
        }
      }
      timer = window.setTimeout(sondear, INTERVALO)
    }

    timer = window.setTimeout(sondear, 0)
    return () => {
      vivo = false
      window.clearTimeout(timer)
    }
  }, [opId, resultado])

  const pagada = op?.estado === 'PAGADA'
  const cancelada = op != null && op.estado !== 'PENDIENTE' && op.estado !== 'PAGADA'

  return (
    <div className="max-w-lg mx-auto animate-fadein">
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 text-center">
        {!terminado ? (
          <>
            <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-5">
              <span className="text-2xl animate-pulse">💳</span>
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
              Verificando tu pago…
            </h2>
            <p className="text-slate-400 text-[14px]">
              Estamos confirmando la operación #{opId} con la pasarela. No cierres esta ventana.
            </p>
          </>
        ) : error ? (
          <>
            <h2 className="text-xl font-bold text-slate-900 mb-2" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>No pudimos verificar el pago</h2>
            <p className="text-slate-500 text-[14px] mb-6">{error} Revisá el estado en tu historial.</p>
            <button onClick={onVerHistorial} className="w-full py-3 rounded-xl text-white text-[14px] font-semibold" style={{ background: 'linear-gradient(135deg,#0f3460,#10b981)' }}>
              Ver historial
            </button>
          </>
        ) : pagada ? (
          <>
            <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-5">
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none"><path d="M6 16l7 7L26 9" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>¡Pago acreditado!</h2>
            <p className="text-slate-500 text-[14px] mb-6">La operación #{opId} quedó confirmada.</p>
            <button onClick={onVerHistorial} className="w-full py-3 rounded-xl text-white text-[14px] font-semibold" style={{ background: 'linear-gradient(135deg,#0f3460,#10b981)' }}>
              Ver en historial
            </button>
          </>
        ) : (
          <>
            <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-5">
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none"><path d="M8 8l12 12M20 8L8 20" stroke="#64748b" strokeWidth="3" strokeLinecap="round" /></svg>
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
              {cancelada ? 'Pago no completado' : 'Todavía no se acreditó el pago'}
            </h2>
            <p className="text-slate-500 text-[14px] mb-6">
              {cancelada
                ? `La operación #${opId} quedó cancelada${op?.motivo_cancelacion === 'PAGO_FALLIDO' ? ' (el pago fue rechazado o expiró)' : ''}. No se te cobró nada.`
                : `La operación #${opId} sigue pendiente. Si ya pagaste, el webhook la confirmará en breve; si no, podés reintentar.`}
            </p>
            <div className="flex gap-3">
              <button onClick={onVerHistorial} className="flex-1 py-3 rounded-xl border border-slate-200 text-[14px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
                Ver historial
              </button>
              <button onClick={onReintentar} className="flex-1 py-3 rounded-xl text-white text-[14px] font-semibold" style={{ background: 'linear-gradient(135deg,#0f3460,#10b981)' }}>
                Reintentar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
