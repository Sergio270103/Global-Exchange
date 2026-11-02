/**
 * Emisión de la factura electrónica de una operación (PI-30).
 *
 * Se muestra debajo del comprobante interno. Precarga el correo del
 * cliente, muestra "emisiones usadas X de N" y emite solo con la acción
 * explícita "Emitir factura" (el backend valida que la operación esté
 * PAGADA, que no tenga otra factura y que quede número disponible).
 * Después permite consultar el estado en SIFEN: el estado lo define
 * SIFEN (DNIT), el cajero solo lo consulta. Cuando queda aprobada se
 * muestra el envío al correo del cliente.
 *
 * @module EmitirFactura
 */
import { useCallback, useEffect, useState } from 'react'
import {
  consultarEstadoFactura,
  emitirFactura,
  ETIQUETA_ESTADO_FACTURA,
  usoFacturas,
  type EstadoFactura,
  type FacturaElectronica,
  type UsoFacturas,
} from '@/services/facturas'

interface Props {
  operacionId: number
}

const ESTILO_ESTADO: Record<EstadoFactura, string> = {
  ANULADA: 'bg-slate-100 text-slate-600', DEVUELTA: 'bg-blue-100 text-blue-600',
  ERROR: 'bg-rose-50 text-rose-700 border-rose-200',
  VERIFICAR: 'bg-amber-50 text-amber-700 border-amber-200',
  EMITIDA: 'bg-sky-50 text-sky-700 border-sky-200',
  APROBADA: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  RECHAZADA: 'bg-rose-50 text-rose-700 border-rose-200',
}

/** Estados con los que ya no se puede volver a emitir. */
const ACTIVOS: EstadoFactura[] = ['VERIFICAR', 'EMITIDA', 'APROBADA']

export default function EmitirFactura({ operacionId }: Props) {
  const [uso, setUso] = useState<UsoFacturas | null>(null)
  const [factura, setFactura] = useState<FacturaElectronica | null>(null)
  const [email, setEmail] = useState('')
  const [cargando, setCargando] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')

  const cargar = useCallback(async () => {
    try {
      const datos = await usoFacturas(operacionId)
      setUso(datos)
      setFactura(datos.factura ?? null)
      setEmail(prev => prev || datos.email_cliente || '')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar la facturación.')
    } finally {
      setCargando(false)
    }
  }, [operacionId])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const handleEmitir = async () => {
    if (!uso) return
    if (
      uso.modo === 'real' &&
      !window.confirm(
        `Se va a emitir la factura N° ${uso.siguiente_numero} a ${email}.\n` +
          `Usa una de las ${uso.disponibles} emisiones disponibles. ¿Continuar?`,
      )
    ) {
      return
    }
    setEnviando(true)
    setError('')
    try {
      setFactura(await emitirFactura(operacionId, email.trim()))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo emitir la factura.')
    } finally {
      // Solo refresca el contador: la factura mostrada es la recién emitida.
      try {
        setUso(await usoFacturas(operacionId))
      } catch {
        /* el contador se actualiza en la próxima apertura */
      }
      setEnviando(false)
    }
  }

  const handleEstado = async () => {
    if (!factura) return
    setEnviando(true)
    setError('')
    try {
      setFactura(await consultarEstadoFactura(factura.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo consultar el estado.')
    } finally {
      setEnviando(false)
    }
  }

  if (cargando) {
    return <p className="mt-4 text-xs text-slate-400 no-print">Cargando facturación…</p>
  }

  const activa = factura != null && ACTIVOS.includes(factura.estado)
  const pagada = uso?.operacion_estado === 'PAGADA'
  const sinCupo = (uso?.disponibles ?? 0) <= 0

  return (
    <div className="mt-4 border border-slate-200 rounded-lg p-4 text-sm no-print space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="font-bold text-slate-800">Factura electrónica</h4>
        {uso && (
          <span className="text-[11px] font-semibold text-slate-500">
            Emisiones usadas {uso.usadas} de {uso.limite}
            {uso.modo === 'simulado' && (
              <span className="ml-1.5 px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">simulado</span>
            )}
          </span>
        )}
      </div>

      {error && (
        <p role="alert" className="text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-2 text-xs">
          {error}
        </p>
      )}

      {factura && (
        <div className="space-y-1 text-xs">
          <div className="flex items-center gap-2">
            <span className={`font-semibold px-2 py-0.5 rounded-full border ${ESTILO_ESTADO[factura.estado]}`}>
              {ETIQUETA_ESTADO_FACTURA[factura.estado]}
            </span>
            {factura.numero_completo && factura.numero && (
              <span className="font-mono font-bold text-slate-700">{factura.numero_completo}</span>
            )}
          </div>
          {factura.detalle && <p className="text-slate-500">{factura.detalle}</p>}
          {factura.cdc && <p className="font-mono text-[10px] text-slate-400 break-all">CDC {factura.cdc}</p>}
          {factura.envio_fecha && (
            <p className="text-emerald-700">
              Enviada a {factura.envio_destinatario} el {new Date(factura.envio_fecha).toLocaleString()} ·{' '}
              {factura.envio_resultado}
            </p>
          )}
        </div>
      )}

      {activa ? (
        factura?.cdc && (
          <button
            type="button"
            onClick={() => void handleEstado()}
            disabled={enviando}
            className="w-full py-2 border border-slate-300 rounded-lg font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {enviando ? 'Consultando…' : '🔄 Consultar estado en SIFEN'}
          </button>
        )
      ) : (
        <>
          <div>
            <label htmlFor={`email-factura-${operacionId}`} className="text-xs font-semibold text-slate-500">
              Correo del cliente
            </label>
            <input
              id={`email-factura-${operacionId}`}
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full mt-1 px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:border-emerald-400"
            />
          </div>
          {!pagada && (
            <p className="text-xs text-slate-500">Solo se factura una operación PAGADA.</p>
          )}
          {sinCupo && (
            <p className="text-xs text-rose-600 font-semibold">
              Se alcanzó el límite de emisiones: no se pueden emitir más facturas.
            </p>
          )}
          <button
            type="button"
            onClick={() => void handleEmitir()}
            disabled={enviando || !pagada || sinCupo || !email.trim()}
            className="w-full py-2 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700 disabled:opacity-60"
          >
            {enviando ? 'Emitiendo…' : '🧾 Emitir factura'}
          </button>
        </>
      )}
    </div>
  )
}
