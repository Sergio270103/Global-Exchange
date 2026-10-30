/**
 * Gestión SIFEN de una factura electrónica (anulación, inutilización y NC).
 *
 * Se abre desde el botón "Gestionar" de la tabla de facturas. Muestra el
 * estado de los eventos, permite solicitar la cancelación de una factura
 * aprobada, inutilizar un número rechazado y emitir una nota de crédito
 * total. Las operaciones son explícitas: el operador confirma cada paso y
 * después consulta el estado en SIFEN. No toca caja ni billeteras.
 *
 * @module GestionFactura
 */
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  cancelarFactura,
  consultarCancelacion,
  consultarEstadoNotaCredito,
  consultarInutilizacion,
  emitirNotaCredito,
  inutilizarFactura,
  MOTIVOS_NOTA_CREDITO,
  type EstadoEvento,
  type NotaCreditoElectronica,
  type NotaCreditoResumen,
  type RespuestaEvento,
} from '@/services/facturas'
import {
  descargarNotaCreditoOficial,
  type DocumentoOficial,
  type FacturaElectronicaCompleta,
} from '@/services/facturasDescarga'

interface Props {
  factura: FacturaElectronicaCompleta
  onActualizada: () => void | Promise<void>
}

type Accion = 'cancelar' | 'inutilizar' | 'nc' | null

const ESTILO_EVENTO: Record<Exclude<EstadoEvento, ''>, string> = {
  PENDIENTE: 'bg-amber-50 text-amber-700 border-amber-200',
  APROBADA: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  RECHAZADA: 'bg-rose-50 text-rose-700 border-rose-200',
  ERROR: 'bg-rose-50 text-rose-700 border-rose-200',
}

function etiquetaEvento(estado: EstadoEvento): string {
  if (!estado) return 'Sin solicitar'
  return estado.charAt(0) + estado.slice(1).toLowerCase()
}

function fecha(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('es-PY', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function monto(valor: number): string {
  return valor.toLocaleString('es-PY', { maximumFractionDigits: 0 })
}

/** Botón de descarga de un documento oficial de la NC. */
function BotonDescargaNc({
  nota, documento, onError,
}: {
  nota: NotaCreditoResumen
  documento: DocumentoOficial
  onError: (mensaje: string) => void
}) {
  const [cargando, setCargando] = useState(false)
  const etiqueta = documento === 'kude' ? 'KuDE' : 'XML'
  const deshabilitado = nota.estado !== 'APROBADA' || nota.simulada
    || !nota.cdc || cargando

  const descargar = async () => {
    setCargando(true)
    try {
      await descargarNotaCreditoOficial(nota, documento)
    } catch (err) {
      onError(err instanceof Error ? err.message : `No se pudo descargar el ${etiqueta}.`)
    } finally {
      setCargando(false)
    }
  }

  return (
    <button
      type="button"
      onClick={() => void descargar()}
      disabled={deshabilitado}
      title={
        nota.simulada
          ? 'Nota de crédito simulada: no tiene documento oficial.'
          : nota.estado !== 'APROBADA'
          ? 'La nota de crédito todavía no está aprobada por SIFEN.'
          : `Descargar ${etiqueta} de la nota de crédito ${nota.numero_completo}`
      }
      aria-label={`Descargar ${etiqueta} NC ${nota.numero_completo}`}
      className="text-[11px] font-semibold text-slate-500 hover:text-blue-600 px-2 py-1 rounded hover:bg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {cargando ? '⏳' : documento === 'kude' ? '📄' : '🧾'} {etiqueta}
    </button>
  )
}

export default function GestionFactura({ factura, onActualizada }: Props) {
  const [abierto, setAbierto] = useState(false)
  const [accion, setAccion] = useState<Accion>(null)
  const [motivo, setMotivo] = useState('')
  const [motivoNc, setMotivoNc] = useState('5')
  const [email, setEmail] = useState(factura.email_destino || '')
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [resultado, setResultado] = useState<RespuestaEvento | null>(null)
  const [ncRecien, setNcRecien] = useState<NotaCreditoElectronica | null>(null)

  useEffect(() => {
    setEmail(factura.email_destino || '')
  }, [factura.email_destino])

  useEffect(() => {
    if (!abierto) return
    const anterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = anterior }
  }, [abierto])

  const abrir = () => {
    setError('')
    setAviso('')
    setAccion(null)
    setResultado(null)
    setNcRecien(null)
    setMotivo('')
    setMotivoNc('5')
    setAbierto(true)
  }

  const cerrar = () => {
    if (cargando) return
    setAbierto(false)
    setAccion(null)
    setError('')
  }

  const refrescar = async () => {
    await onActualizada()
  }

  const confirmarCancelacion = async () => {
    setCargando(true)
    setError('')
    setAviso('')
    try {
      const r = await cancelarFactura(factura.id, motivo.trim())
      setResultado(r)
      setAccion(null)
      setAviso('Solicitud de anulación enviada. Consultá el estado en SIFEN en ~1 minuto.')
      await refrescar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo anular la factura.')
    } finally {
      setCargando(false)
    }
  }

  const confirmarInutilizacion = async () => {
    setCargando(true)
    setError('')
    setAviso('')
    try {
      const r = await inutilizarFactura(factura.id, motivo.trim())
      setResultado(r)
      setAccion(null)
      setAviso('Solicitud de inutilización enviada. Consultá el estado en SIFEN en ~1 minuto.')
      await refrescar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo inutilizar el número.')
    } finally {
      setCargando(false)
    }
  }

  const confirmarNc = async () => {
    setCargando(true)
    setError('')
    setAviso('')
    try {
      const nota = await emitirNotaCredito(factura.id, motivoNc, email.trim())
      setNcRecien(nota)
      setAccion(null)
      setAviso(`Nota de crédito ${nota.numero_completo} emitida (${nota.estado}).`)
      await refrescar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo emitir la nota de crédito.')
    } finally {
      setCargando(false)
    }
  }

  const consultarEvento = async (tipo: 'cancelacion' | 'inutilizacion') => {
    setCargando(true)
    setError('')
    setAviso('')
    try {
      const r = tipo === 'cancelacion'
        ? await consultarCancelacion(factura.id)
        : await consultarInutilizacion(factura.id)
      setResultado(r)
      setAviso(
        r.evento.estado === 'APROBADA'
          ? `${tipo === 'cancelacion' ? 'Cancelación' : 'Inutilización'} aprobada por SIFEN.`
          : `Estado de ${tipo}: ${etiquetaEvento(r.evento.estado)}.`,
      )
      await refrescar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo consultar el estado.')
    } finally {
      setCargando(false)
    }
  }

  const consultarNc = async (nota: NotaCreditoResumen) => {
    setCargando(true)
    setError('')
    setAviso('')
    try {
      const actualizada = await consultarEstadoNotaCredito(nota.id)
      setNcRecien(actualizada)
      setAviso(`Nota de crédito ${actualizada.numero_completo}: ${actualizada.estado}.`)
      await refrescar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo consultar la nota de crédito.')
    } finally {
      setCargando(false)
    }
  }

  const cancelacionPendiente = factura.estado_cancelacion === 'PENDIENTE'
  const inutilizacionPendiente = factura.estado_inutilizacion === 'PENDIENTE'
  const notas = factura.notas_credito ?? []
  const eventos = factura.eventos ?? []

  const botonPrimario = (texto: string, onClick: () => void, icono: string) => (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left px-3 py-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 font-semibold text-slate-700 text-[13px]"
    >
      <span className="mr-2">{icono}</span>{texto}
    </button>
  )

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        aria-label={`Gestionar factura ${factura.numero_completo}`}
        className="text-[12px] font-semibold text-slate-500 hover:text-emerald-700 px-2 py-1 rounded hover:bg-emerald-50 transition-colors"
      >
        ⚙️ Gestionar
      </button>

      {abierto && createPortal(
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex justify-center items-center z-50 p-4">
          <div
            role="dialog"
            aria-label="Gestión SIFEN"
            className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden text-xs"
          >
            <div className="flex justify-between items-center px-6 py-4 border-b border-slate-200 shrink-0">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Gestión SIFEN</h3>
                <p className="font-mono text-[11px] text-slate-500 mt-0.5">
                  {factura.numero_completo || 'sin número'} · {factura.estado}
                </p>
              </div>
              <button
                type="button"
                onClick={cerrar}
                aria-label="Cerrar gestión"
                className="text-slate-400 hover:text-slate-600 text-sm"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4">
              {error && (
                <p role="alert" className="text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-2">
                  {error}
                </p>
              )}
              {aviso && (
                <p role="status" className="text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-2">
                  {aviso}
                </p>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="rounded-lg border border-slate-200 p-2.5">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Factura</div>
                  <div className="font-semibold text-slate-700 mt-1">{factura.estado}</div>
                </div>
                <div className="rounded-lg border border-slate-200 p-2.5">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Cancelación</div>
                  <div className={`inline-block mt-1 px-2 py-0.5 rounded-full border font-semibold ${
                    factura.estado_cancelacion
                      ? ESTILO_EVENTO[factura.estado_cancelacion as Exclude<EstadoEvento, ''>]
                      : 'bg-slate-50 text-slate-500 border-slate-200'
                  }`}>
                    {etiquetaEvento(factura.estado_cancelacion ?? '')}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 p-2.5">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Inutilización</div>
                  <div className={`inline-block mt-1 px-2 py-0.5 rounded-full border font-semibold ${
                    factura.estado_inutilizacion
                      ? ESTILO_EVENTO[factura.estado_inutilizacion as Exclude<EstadoEvento, ''>]
                      : 'bg-slate-50 text-slate-500 border-slate-200'
                  }`}>
                    {etiquetaEvento(factura.estado_inutilizacion ?? '')}
                  </div>
                </div>
              </div>

              {resultado && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                  <div className="font-semibold text-slate-700">
                    {resultado.evento.tipo_display}: {etiquetaEvento(resultado.evento.estado)}
                  </div>
                  <p className="text-slate-500 mt-1">{resultado.evento.detalle || 'Sin detalle.'}</p>
                  {resultado.evento.cdc_evento && (
                    <p className="font-mono text-[10px] text-slate-400 mt-1 break-all">
                      CDC {resultado.evento.cdc_evento}
                    </p>
                  )}
                </div>
              )}

              {!accion && (
                <div className="space-y-2">
                  {factura.puede_cancelar && botonPrimario(
                    'Anular comprobante', () => setAccion('cancelar'), '🚫')}
                  {factura.puede_inutilizar && botonPrimario(
                    'Inutilizar número', () => setAccion('inutilizar'), '🗑️')}
                  {factura.puede_nota_credito && botonPrimario(
                    'Emitir nota de crédito', () => setAccion('nc'), '🧾')}
                  {cancelacionPendiente && (
                    <button
                      type="button"
                      onClick={() => void consultarEvento('cancelacion')}
                      disabled={cargando}
                      className="w-full px-3 py-2.5 rounded-lg border border-amber-200 bg-amber-50 hover:bg-amber-100 font-semibold text-amber-800 text-[13px] disabled:opacity-60"
                    >
                      🔄 Consultar cancelación
                    </button>
                  )}
                  {inutilizacionPendiente && (
                    <button
                      type="button"
                      onClick={() => void consultarEvento('inutilizacion')}
                      disabled={cargando}
                      className="w-full px-3 py-2.5 rounded-lg border border-amber-200 bg-amber-50 hover:bg-amber-100 font-semibold text-amber-800 text-[13px] disabled:opacity-60"
                    >
                      🔄 Consultar inutilización
                    </button>
                  )}
                  {!factura.puede_cancelar && !factura.puede_inutilizar
                    && !factura.puede_nota_credito && !cancelacionPendiente
                    && !inutilizacionPendiente && (
                    <p className="text-slate-500">
                      No hay acciones disponibles para esta factura.
                    </p>
                  )}
                </div>
              )}

              {accion === 'cancelar' && (
                <div className="rounded-lg border border-rose-200 bg-rose-50/50 p-3 space-y-2">
                  <h4 className="font-bold text-rose-800">Confirmar anulación</h4>
                  <p className="text-rose-700">
                    Se enviará <code>sol_cancelacion</code> a SIFEN para
                    {' '}{factura.numero_completo}. SIFEN no recibe un motivo;
                    queda en el historial interno.
                  </p>
                  <label htmlFor="motivo-cancelacion" className="block font-semibold text-slate-600">
                    Motivo de la anulación
                  </label>
                  <textarea
                    id="motivo-cancelacion"
                    value={motivo}
                    onChange={e => setMotivo(e.target.value)}
                    maxLength={255}
                    rows={2}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-rose-400"
                    placeholder="Ej.: el cliente desistió de la operación"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => { setAccion(null); setMotivo('') }}
                      disabled={cargando}
                      className="flex-1 py-2 border border-slate-300 rounded-lg bg-white text-slate-600 font-semibold"
                    >
                      Volver
                    </button>
                    <button
                      type="button"
                      onClick={() => void confirmarCancelacion()}
                      disabled={cargando}
                      className="flex-1 py-2 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-lg disabled:opacity-50"
                    >
                      {cargando ? 'Enviando…' : 'Confirmar anulación'}
                    </button>
                  </div>
                </div>
              )}

              {accion === 'inutilizar' && (
                <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 space-y-2">
                  <h4 className="font-bold text-amber-800">Confirmar inutilización</h4>
                  <p className="text-amber-700">
                    Se enviará <code>sol_inutilizacion</code> para el número
                    {' '}{factura.numero_completo}. Usalo solo si el número fue
                    consumido y SIFEN no aprobó el documento.
                  </p>
                  <label htmlFor="motivo-inutilizacion" className="block font-semibold text-slate-600">
                    Motivo de la inutilización
                  </label>
                  <textarea
                    id="motivo-inutilizacion"
                    value={motivo}
                    onChange={e => setMotivo(e.target.value)}
                    maxLength={255}
                    rows={2}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-amber-400"
                    placeholder="Ej.: número rechazado por SIFEN"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => { setAccion(null); setMotivo('') }}
                      disabled={cargando}
                      className="flex-1 py-2 border border-slate-300 rounded-lg bg-white text-slate-600 font-semibold"
                    >
                      Volver
                    </button>
                    <button
                      type="button"
                      onClick={() => void confirmarInutilizacion()}
                      disabled={cargando}
                      className="flex-1 py-2 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-lg disabled:opacity-50"
                    >
                      {cargando ? 'Enviando…' : 'Confirmar inutilización'}
                    </button>
                  </div>
                </div>
              )}

              {accion === 'nc' && (
                <div className="rounded-lg border border-sky-200 bg-sky-50/50 p-3 space-y-2">
                  <h4 className="font-bold text-sky-800">Confirmar nota de crédito</h4>
                  <p className="text-sky-700">
                    Se emitirá una NC total por ₲ {monto(factura.total)} que
                    referencia el CDC de la factura. La operación y la caja no
                    se modifican automáticamente.
                  </p>
                  <label htmlFor="motivo-nc" className="block font-semibold text-slate-600">
                    Motivo de la nota de crédito
                  </label>
                  <select
                    id="motivo-nc"
                    value={motivoNc}
                    onChange={e => setMotivoNc(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-sky-400"
                  >
                    {MOTIVOS_NOTA_CREDITO.map(m => (
                      <option key={m.codigo} value={m.codigo}>
                        {m.codigo} · {m.etiqueta}
                      </option>
                    ))}
                  </select>
                  <label htmlFor="email-nc" className="block font-semibold text-slate-600">
                    Correo del cliente
                  </label>
                  <input
                    id="email-nc"
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-sky-400"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => { setAccion(null); setMotivo('') }}
                      disabled={cargando}
                      className="flex-1 py-2 border border-slate-300 rounded-lg bg-white text-slate-600 font-semibold"
                    >
                      Volver
                    </button>
                    <button
                      type="button"
                      onClick={() => void confirmarNc()}
                      disabled={cargando || !email.trim()}
                      className="flex-1 py-2 bg-sky-600 hover:bg-sky-700 text-white font-semibold rounded-lg disabled:opacity-50"
                    >
                      {cargando ? 'Emitiendo…' : 'Confirmar nota de crédito'}
                    </button>
                  </div>
                </div>
              )}

              {ncRecien && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-2.5">
                  <div className="font-semibold text-emerald-800">
                    Nota de crédito {ncRecien.numero_completo} · {ncRecien.estado}
                  </div>
                  <p className="text-emerald-700 mt-1">{ncRecien.detalle || 'Sin detalle.'}</p>
                </div>
              )}

              <div>
                <h4 className="font-bold text-slate-700 mb-2">Notas de crédito</h4>
                {notas.length === 0 ? (
                  <p className="text-slate-400">Esta factura no tiene notas de crédito.</p>
                ) : (
                  <ul className="space-y-2">
                    {notas.map(nota => (
                      <li key={nota.id} className="rounded-lg border border-slate-200 p-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <span className="font-mono font-bold text-slate-700">
                              {nota.numero_completo}
                            </span>
                            <span className="ml-2 text-slate-500">{nota.motivo_display}</span>
                          </div>
                          <span className={`px-2 py-0.5 rounded-full border font-semibold ${
                            ESTILO_EVENTO[nota.estado as Exclude<EstadoEvento, ''>]
                              ?? 'bg-slate-50 text-slate-500 border-slate-200'
                          }`}>
                            {nota.estado}
                          </span>
                        </div>
                        <div className="mt-1 text-slate-500">
                          Total ₲ {monto(nota.total)} · {fecha(nota.creada)}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {nota.estado !== 'APROBADA' && (
                            <button
                              type="button"
                              onClick={() => void consultarNc(nota)}
                              disabled={cargando}
                              className="text-[11px] font-semibold text-sky-700 hover:bg-sky-50 px-2 py-1 rounded disabled:opacity-50"
                            >
                              🔄 Consultar NC
                            </button>
                          )}
                          <BotonDescargaNc nota={nota} documento="kude" onError={setError} />
                          <BotonDescargaNc nota={nota} documento="xml" onError={setError} />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {eventos.length > 0 && (
                <details className="rounded-lg border border-slate-200 p-2.5">
                  <summary className="font-semibold text-slate-600 cursor-pointer">
                    Historial de eventos SIFEN ({eventos.length})
                  </summary>
                  <ul className="mt-2 space-y-1.5">
                    {eventos.map(ev => (
                      <li key={ev.id} className="text-slate-500">
                        <span className="font-semibold text-slate-700">{ev.tipo_display}</span>
                        {' · '}{etiquetaEvento(ev.estado)}{' · '}{fecha(ev.solicitado)}
                        {ev.detalle && <div className="text-[11px]">{ev.detalle}</div>}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>

            <div className="shrink-0 border-t border-slate-200 bg-slate-50 px-6 py-3">
              <button
                type="button"
                onClick={cerrar}
                disabled={cargando}
                className="w-full py-2 border border-slate-300 rounded-lg bg-white text-slate-600 font-semibold disabled:opacity-50"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
