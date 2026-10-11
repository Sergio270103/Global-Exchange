/**
 * Modal de alerta disparada al iniciar sesión (PI-38).
 *
 * Al entrar al dashboard, si el usuario tiene disparos de alertas de
 * tasa aún no vistos en esta sesión, muestra un recuadro grande en el
 * centro con la notificación. La X lo cierra y lo marca como visto
 * (se recuerda en `sessionStorage`, una vez por sesión).
 *
 * @module ModalAlerta
 */
import { useEffect, useState } from 'react'
import { historialDisparos, type DisparoAlerta } from '@/services/alertas'
import type { Page } from '@/types'

const CLAVE_VISTAS = 'alertasVistas'

function leerVistas(): number[] {
  try {
    return JSON.parse(sessionStorage.getItem(CLAVE_VISTAS) ?? '[]')
  } catch {
    return []
  }
}

interface Props {
  navigate: (p: Page) => void
}

export default function ModalAlerta({ navigate }: Props) {
  const [pendientes, setPendientes] = useState<DisparoAlerta[]>([])

  useEffect(() => {
    historialDisparos()
      .then(disparos => {
        const vistas = leerVistas()
        setPendientes(disparos.filter(d => !vistas.includes(d.id)))
      })
      .catch(() => {})
  }, [])

  function cerrar() {
    try {
      const vistas = leerVistas()
      sessionStorage.setItem(
        CLAVE_VISTAS,
        JSON.stringify([...vistas, ...pendientes.map(d => d.id)]),
      )
    } catch {
      // Sin almacenamiento, igual se cierra.
    }
    setPendientes([])
  }

  if (pendientes.length === 0) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/60 px-4 pt-[8vh] pb-4 overflow-y-auto animate-fadein" role="dialog" aria-label="Alerta de tasa disparada">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[84vh] overflow-y-auto p-6 sm:p-8 relative text-center">
        <button
          onClick={cerrar}
          aria-label="Cerrar notificación"
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 font-bold transition-colors"
        >
          ✕
        </button>
        <div className="text-5xl sm:text-6xl mb-4">🔔</div>
        <h2 className="font-bold text-slate-900 text-lg sm:text-xl mb-2" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
          ¡Alerta de tasa disparada!</h2>
        <div className="space-y-3 my-5 text-left">
          {pendientes.map(d => (
            <div key={d.id} className="border border-emerald-100 bg-emerald-50/50 rounded-xl p-4">
              <div className="font-bold text-slate-900 text-[15px]">
                {d.moneda_codigo}/PYG {d.direccion === 'supera' ? 'alcanzó o superó' : 'bajó hasta'} {d.tasa_alcanzada.toLocaleString()}
              </div>
              <div className="text-slate-500 text-[13px] mt-1">
                Tu objetivo era {d.umbral.toLocaleString()} · {new Date(d.creado).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
        <button
          onClick={() => { cerrar(); navigate('notifications') }}
          className="w-full py-2.5 rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-opacity"
          style={{ background: 'linear-gradient(135deg,#0f3460,#10b981)' }}
        >
          Ver en Notificaciones
        </button>
      </div>
    </div>
  )
}
