/**
 * Vista de compra y venta de divisas conectada al backend (Hito Operaciones).
 *
 * - Tasas vigentes desde `GET /cotizaciones/vigentes/`.
 * - Resumen con precio final desde `GET /simulador/`, con el ajuste por
 *   categoría aplicado en el backend y sin mostrar su desglose.
 * - Inicio con `POST /api/operaciones/` (queda PENDIENTE con la tasa
 *   congelada) y validación cliente activo + asociación (`detail` 400)
 *   mostrada inline en rojo, bloqueando el botón.
 * - PI-64: en la confirmación se muestra cuánto dura la tasa garantizada.
 *   Si al confirmar la cotización cambió (fuera de la ventana), se muestra
 *   la nueva y el usuario puede aceptarla o cancelar sin costo.
 * - Éxito con modal "Transacción Exitosa" y comprobante.
 * - PI-71: los selects de divisa y contraparte nacen del catálogo de
 *   monedas ACTIVAS (`GET /monedas/?activo=true`), no solo de vigentes:
 *   lo que el admin deshabilita desaparece de comprar/vender al instante.
 *   Las activas sin cotización se listan deshabilitadas ("sin cotización");
 *   su primera tasa se registra en Monedas (admin).
 *
 * @module BuySell
 */
import { useEffect, useMemo, useState } from 'react'
import { vigentes, type Cotizacion } from '@/services/cotizaciones'
import { listarMonedas } from '@/services/monedas'
import { simular } from '@/services/simulador'
import {
  crearOperacion,
  confirmarOperacion,
  cancelarOperacion,
  verificarClienteOperable,
  ERROR_CLIENTE_INACTIVO,
  type Operacion,
  type MotivoCancelacion,
} from '@/services/operaciones'
import { listarMetodos, type MetodoPago } from '@/services/metodos'
import { listarBilleteras, listarMedios, type Billetera, type MedioAcreditacion } from '@/services/billeteras'
import { listarCuentas } from '@/services/cuentas'
import type { BankAccount } from '@/types'
import { type AuthUser, type ClienteActivo, type Currency } from '@/types'

export interface BuySellProps {
  auth: AuthUser
  currentClient: ClienteActivo | null
}

type Step = 'form' | 'confirm' | 'receipt' | 'cancelled'

interface Resumen {
  tasaEfectiva: number
  total: number
  totalTipo: 'pagar' | 'recibir'
  monedaOrigen: string
  monedaDestino: string
}

function formatoMonto(valor: number, codigo: string, decimales?: Map<string, number>): string {
  const dec = decimales?.get(codigo) ?? (codigo === 'PYG' ? 0 : 2)
  return `${valor.toLocaleString('es-PY', { minimumFractionDigits: dec, maximumFractionDigits: dec })} ${codigo}`
}

export default function BuySell({ auth: _auth, currentClient }: BuySellProps) {
  const [mode, setMode] = useState<'buy' | 'sell'>('buy')
  const [step, setStep] = useState<Step>('form')
  const [divisa, setDivisa] = useState('USD')
  const [contraparte, setContraparte] = useState('PYG')
  const [amount, setAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('transfer')
  const [metodos, setMetodos] = useState<MetodoPago[]>([])

  // PI-73: la compra se paga por transferencia (cuenta bancaria obligatoria)
  // o con la billetera PYG; lo recibido se acredita siempre en la billetera.
  const [billeteras, setBilleteras] = useState<Billetera[]>([])
  const [cuentasCli, setCuentasCli] = useState<BankAccount[]>([])
  const [origenSel, setOrigenSel] = useState('')

  const [tasas, setTasas] = useState<Cotizacion[]>([])
  const [monedas, setMonedas] = useState<Currency[]>([])
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState('')

  const [clienteOk, setClienteOk] = useState(false)
  const [clienteMotivo, setClienteMotivo] = useState('')
  const [verificandoCliente, setVerificandoCliente] = useState(false)

  const [resumen, setResumen] = useState<Resumen | null>(null)
  const [simulando, setSimulando] = useState(false)
  const [simError, setSimError] = useState('')

  const [operacion, setOperacion] = useState<Operacion | null>(null)
  const [creando, setCreando] = useState(false)
  const [errorPost, setErrorPost] = useState('')

  // PI-64: operación pendiente, cotización anterior (si cambió) y cuenta regresiva.
  const [pendiente, setPendiente] = useState<Operacion | null>(null)
  const [anterior, setAnterior] = useState<Operacion | null>(null)
  const [segundos, setSegundos] = useState(0)
  const [iniciando, setIniciando] = useState(false)
  const [cancelando, setCancelando] = useState(false)

  const amountNum = useMemo(() => parseFloat(amount) || 0, [amount])
  const tipo = mode === 'buy' ? 'COMPRA' : 'VENTA'

  // PI-71: universo operable = vigentes ∩ catálogo de activas. Si el
  // catálogo falla, se usa vigentes como respaldo (comportamiento anterior).
  const codigosActivos = useMemo(
    () => new Set(monedas.length > 0 ? monedas.map(m => m.code) : tasas.map(t => t.moneda)),
    [monedas, tasas],
  )
  const tasasUtiles = useMemo(
    () => (monedas.length > 0 ? tasas.filter(t => codigosActivos.has(t.moneda)) : tasas),
    [tasas, monedas, codigosActivos],
  )
  const decimales = useMemo(() => {
    const map = new Map<string, number>()
    monedas.forEach(m => map.set(m.code, m.decimals))
    return map
  }, [monedas])
  const pygCatalogo = useMemo(() => monedas.find(m => m.code === 'PYG'), [monedas])

  // Carga inicial: tasas, métodos de pago y catálogo de monedas activas.
  useEffect(() => {
    Promise.all([
      vigentes(),
      listarMetodos().catch(() => [] as MetodoPago[]),
      listarMonedas(true).catch(() => [] as Currency[]),
    ])
      .then(([t, m, cm]) => {
        setTasas(t)
        setMetodos(m.filter(x => x.activo))
        setMonedas(cm)
        // PI-71: solo operan las monedas activas del catálogo. Si el
        // catálogo no cargó, se usa vigentes como respaldo.
        const activas = new Set(cm.length > 0 ? cm.map(x => x.code) : t.map(x => x.moneda))
        const utiles = t.filter(x => activas.has(x.moneda)).map(x => x.moneda)
        setDivisa(prev => (utiles.includes(prev) ? prev : utiles.includes('USD') ? 'USD' : utiles[0] ?? prev))
        setContraparte(prev => {
          const ops = [
            ...((cm.length === 0 || activas.has('PYG')) ? ['PYG'] : []),
            ...utiles,
          ].filter((x, i, a) => a.indexOf(x) === i)
          return ops.includes(prev) ? prev : ops[0] ?? prev
        })
      })
      .catch(() => setErrorCarga('No se pudieron cargar las tasas. Verificá que el backend esté corriendo.'))
      .finally(() => setCargando(false))
  }, [])

  // Validación pre-vuelo del cliente activo (mensaje inline rojo).
  useEffect(() => {
    let vivo = true
    setVerificandoCliente(true)
    verificarClienteOperable(currentClient?.id)      .then(r => {
        if (!vivo) return
        setClienteOk(r.ok)
        setClienteMotivo(r.ok ? '' : (r.motivo ?? ERROR_CLIENTE_INACTIVO))
      })
      .catch(() => {
        if (!vivo) return
        setClienteOk(false)
        setClienteMotivo(ERROR_CLIENTE_INACTIVO)
      })
      .finally(() => vivo && setVerificandoCliente(false))
    return () => { vivo = false }
  }, [currentClient])

  // PI-66: billeteras, cuentas y medio por defecto del cliente.
  // Solo se aplica el default al cambiar de cliente (no se pisa al usuario).
  useEffect(() => {
    const id = currentClient?.id
    if (!id) {
      setBilleteras([])
      setCuentasCli([])
      setOrigenSel('')
      return
    }
    let vivo = true
    Promise.all([
      listarBilleteras(id).catch(() => [] as Billetera[]),
      listarCuentas(id).catch(() => [] as BankAccount[]),
      listarMedios(id).catch(() => [] as MedioAcreditacion[]),
    ]).then(([bs, cs, ms]) => {
      if (!vivo) return
      setBilleteras(bs)
      setCuentasCli(cs)
      const def = ms.find(m => m.es_default)
      // Los códigos vigentes al cargar (divisa/contraparte por defecto).
      const codOrigen = mode === 'buy' ? contraparte : divisa
      if (def?.cuenta) {
        const c = cs.find(x => x.id === def.cuenta)
        if (c && c.currency === codOrigen && c.status === 'Activa') setOrigenSel(`C:${c.id}`)
      }
    })
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentClient?.id])

  // El backend devuelve el precio final; el ajuste por categoría no se
  // descarga ni se muestra en el cliente.
  useEffect(() => {
    if (amountNum <= 0 || tasasUtiles.length === 0) {
      setResumen(null)
      setSimError(tasasUtiles.length === 0 && amountNum > 0
        ? 'No hay cotizaciones vigentes para las monedas activas.'
        : '')
      return
    }
    let vivo = true
    setSimulando(true)
    setSimError('')

    const correr = async () => {
      try {
        const s = await simular({
          moneda: divisa,
          monto: amountNum,
          operacion: mode === 'buy' ? 'compra' : 'venta',
          clienteId: currentClient?.id ?? 0,
          monedaContraparte: contraparte,
        })
        if (!vivo) return
        setResumen({
          tasaEfectiva: s.tasa_aplicada,
          total: s.monto_total,
          totalTipo: s.total_tipo,
          monedaOrigen: mode === 'buy' ? contraparte : divisa,
          monedaDestino: mode === 'buy' ? divisa : contraparte,
        })
      } catch (err) {
        if (!vivo) return
        setResumen(null)
        setSimError(err instanceof Error ? err.message : 'No se pudo calcular el precio final.')
      } finally {
        if (vivo) setSimulando(false)
      }
    }
    const timer = setTimeout(correr, 350)
    return () => { vivo = false; clearTimeout(timer) }
  }, [amountNum, divisa, contraparte, mode, tasasUtiles, currentClient?.id])


  // Cuenta regresiva de la tasa garantizada (solo visual: el backend decide).
  useEffect(() => {
    if (step !== 'confirm' || !pendiente) return
    setSegundos(pendiente.segundos_restantes)
    const id = setInterval(() => setSegundos(s => (s > 0 ? s - 1 : 0)), 1000)
    return () => clearInterval(id)
  }, [step, pendiente])

  // PI-66: códigos de cada pata según el modo.
  const codigoOrigen = mode === 'buy' ? contraparte : divisa
  const codigoDestino = mode === 'buy' ? divisa : contraparte
  // PI-73: la cuenta bancaria solo se usa al comprar por transferencia; las
  // billeteras (origen y destino) las resuelve el backend según la moneda.
  const opcionesOrigenCuenta = mode === 'buy'
    ? cuentasCli.filter(c => c.status === 'Activa' && c.currency === codigoOrigen)
    : []
  const billeteraOrigen = billeteras.find(b => b.moneda_codigo === codigoOrigen)
  const billeteraDestino = billeteras.find(b => b.moneda_codigo === codigoDestino)
  const pagaConBilletera = mode === 'sell' || paymentMethod === 'wallet'
  const requiereCuenta = mode === 'buy' && paymentMethod === 'transfer'

  // Si el par cambia y la cuenta elegida ya no vale, se limpia.
  useEffect(() => {
    if (!origenSel) return
    const id = Number(origenSel.split(':')[1])
    const ok = cuentasCli.some(c => c.id === id && c.currency === codigoOrigen && c.status === 'Activa')
    if (!ok) setOrigenSel('')
  }, [codigoOrigen, cuentasCli, origenSel])

  const bloqueado = !clienteOk || amountNum <= 0 || !resumen || simulando
    || (requiereCuenta && !origenSel)
  const mostrarErrorCliente = !verificandoCliente && !clienteOk

  /** "Continuar": crea la operación PENDIENTE y congela la cotización. */
  const iniciar = async () => {
    if (!currentClient || bloqueado || iniciando) return
    setIniciando(true)
    setErrorPost('')
    try {
      const op = await crearOperacion({
        clienteId: currentClient.id,
        tipo,
        moneda: divisa,
        montoDivisa: amountNum,
        monedaContraparte: contraparte,
        metodoPago: mode === 'buy' ? paymentMethod : '',
        cuentaOrigenId: requiereCuenta && origenSel ? Number(origenSel.slice(2)) : null,
        billeteraDestinoId: null,
        billeteraOrigenId: null,
      })
      if (op.estado === 'CANCELADA') {
        // PI-73: sin fondos en la billetera, el backend la registra cancelada.
        setOperacion(op)
        setStep('cancelled')
        return
      }
      setPendiente(op)
      setAnterior(null)
      setStep('confirm')
    } catch (err) {
      setErrorPost(err instanceof Error ? err.message : 'No se pudo iniciar la operación.')
    } finally {
      setIniciando(false)
    }
  }

  /** Confirma; si la tasa cambió, muestra la nueva y espera la decisión. */
  const confirmar = async () => {
    if (!pendiente || creando) return
    setCreando(true)
    setErrorPost('')
    try {
      const r = await confirmarOperacion(pendiente.id)
      if (r.resultado === 'CONFIRMADA') {
        setOperacion(r.operacion)
        setPendiente(null)
        setAnterior(null)
        setStep('receipt')
      } else if (r.resultado === 'FONDOS_INSUFICIENTES') {
        // PI-73: el backend ya la canceló; mostramos la pantalla de cancelada.
        setOperacion(r.operacion)
        setPendiente(null)
        setAnterior(null)
        setStep('cancelled')
      } else {
        // Guardamos la primera cotización que vio el usuario para comparar.
        setAnterior(prev => prev ?? r.anterior)
        setPendiente(r.operacion)
      }
    } catch (err) {
      setErrorPost(err instanceof Error ? err.message : 'No se pudo confirmar la operación.')
    } finally {
      setCreando(false)
    }
  }

  /** Cancela sin costo la operación pendiente. */
  const cancelar = async (motivo: MotivoCancelacion) => {
    if (!pendiente || cancelando) return
    setCancelando(true)
    setErrorPost('')
    try {
      const op = await cancelarOperacion(pendiente.id, motivo)
      setPendiente(null)
      setAnterior(null)
      if (motivo === 'DESISTIO') {
        setStep('form')
      } else {
        setOperacion(op)
        setStep('cancelled')
      }
    } catch (err) {
      setErrorPost(err instanceof Error ? err.message : 'No se pudo cancelar la operación.')
    } finally {
      setCancelando(false)
    }
  }

  const resetForm = () => {
    setStep('form')
    setAmount('')
    setOperacion(null)
    setPendiente(null)
    setAnterior(null)
    setErrorPost('')
  }

  const nombreCliente = currentClient?.nombre ?? 'Sin cliente seleccionado'
  const divisasDisponibles = tasasUtiles
  // PI-71b: las activas SIN cotización se listan deshabilitadas para
  // explicar por qué no operan todavía (ej. ARS activa sin tasa).
  const sinTasa = (code: string): boolean =>
    monedas.length > 0
    && code !== 'PYG'
    && codigosActivos.has(code)
    && !tasasUtiles.some(t => t.moneda === code)
  const opcionesDivisa = [
    ...tasasUtiles.map(t => ({ moneda: t.moneda, nombre: t.nombre, flag: t.flag, sinTasa: false })),
    ...monedas.filter(m => sinTasa(m.code)).map(m => ({ moneda: m.code, nombre: m.name, flag: m.flag, sinTasa: true })),
  ]
  const contrapartes = [
    ...((monedas.length === 0 || codigosActivos.has('PYG'))
      ? [{ moneda: 'PYG', nombre: pygCatalogo?.name ?? 'Guaraní', flag: pygCatalogo?.flag ?? '🇵🇾', sinTasa: false }]
      : []),
    ...tasasUtiles.filter(t => t.moneda !== divisa).map(t => ({ moneda: t.moneda, nombre: t.nombre, flag: t.flag, sinTasa: false })),
    ...monedas.filter(m => m.code !== divisa && sinTasa(m.code)).map(m => ({ moneda: m.code, nombre: m.name, flag: m.flag, sinTasa: true })),
  ]

  if (cargando) {
    return (
      <div className="max-w-2xl mx-auto bg-white rounded-2xl border border-slate-100 shadow-sm p-10 text-center text-slate-400 text-[14px]">
        Cargando tasas vigentes…
      </div>
    )
  }

  if (errorCarga) {
    return (
      <div role="alert" className="max-w-2xl mx-auto bg-white rounded-2xl border border-red-100 shadow-sm p-10 text-center text-red-500 text-[14px]">
        {errorCarga}
      </div>
    )
  }

  if (step === 'receipt' && operacion) {
    const fecha = new Date(operacion.fecha_creacion).toLocaleString('es-PY', { dateStyle: 'medium', timeStyle: 'short' })
    return (
      <div className="max-w-lg mx-auto animate-fadein">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-5">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none"><path d="M6 16l7 7L26 9" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Transacción Exitosa</h2>
          <p className="text-slate-400 text-[14px] mb-6">Comprobante de la operación cambiaria</p>

          <div className="bg-slate-50 rounded-xl p-4 text-left space-y-3 mb-6">
            {[
              ['Número de operación', `#${operacion.id}`],
              ['Tipo', `${operacion.tipo_operacion === 'COMPRA' ? 'Compra' : 'Venta'} de ${divisa}`],
              ['Origen', `${operacion.monto_enviado.toLocaleString()} ${operacion.moneda_origen_codigo}`],
              ['Destino (neto)', `${operacion.monto_recibido.toLocaleString()} ${operacion.moneda_destino_codigo}`],
              ['Tipo efectivo', `${Number(operacion.cotizacion_aplicada).toLocaleString()}`],
              ['Fecha', fecha],
              ['Cliente', operacion.cliente_nombre || nombreCliente],
            ].map(([label, value]) => (
              <div key={label as string} className="flex justify-between items-start">
                <span className="text-[12px] text-slate-400 font-medium">{label}</span>
                <span className="text-[13px] font-semibold text-slate-800 text-right">{value}</span>
              </div>
            ))}
          </div>

          <div className="flex gap-3">
            <button className="flex-1 py-2.5 rounded-xl border border-slate-200 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
              📄 Descargar PDF
            </button>
            <button onClick={resetForm} className="flex-1 py-2.5 rounded-xl text-white text-[13px] font-semibold transition-all hover:-translate-y-0.5" style={{ background: 'linear-gradient(135deg,#0f3460,#10b981)' }}>
              Nueva operación
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (step === 'cancelled' && operacion) {
    const fecha = operacion.fecha_cancelacion
      ? new Date(operacion.fecha_cancelacion).toLocaleString('es-PY', { dateStyle: 'medium', timeStyle: 'short' })
      : ''
    return (
      <div className="max-w-lg mx-auto animate-fadein">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-5">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none"><path d="M8 8l12 12M20 8L8 20" stroke="#64748b" strokeWidth="3" strokeLinecap="round" /></svg>
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Transacción cancelada</h2>
          {operacion.motivo_cancelacion === 'FONDOS_INSUFICIENTES' && (
            <p className="text-red-600 text-[14px] font-semibold mb-2">
              Fondos insuficientes en la billetera origen.
            </p>
          )}
          <p className="text-slate-500 text-[14px] mb-6">
            No se te cobró nada. La operación #{operacion.id} queda en tu historial como cancelada.
          </p>
          {fecha && <p className="text-slate-400 text-[12px] mb-6">Cancelada el {fecha}</p>}
          <button onClick={resetForm} className="w-full py-3 rounded-xl text-white text-[14px] font-semibold transition-all hover:-translate-y-0.5" style={{ background: 'linear-gradient(135deg,#0f3460,#10b981)' }}>
            Nueva operación
          </button>
        </div>
      </div>
    )
  }

  if (step === 'confirm' && pendiente) {
    const op = pendiente
    const cambio = anterior !== null
    const esCompra = op.tipo_operacion === 'COMPRA'
    const totalLabel = esCompra ? 'Total a pagar' : 'Total a recibir'
    const totalValor = esCompra
      ? formatoMonto(op.monto_enviado, op.moneda_origen_codigo, decimales)
      : formatoMonto(op.monto_recibido, op.moneda_destino_codigo, decimales)
    const totalAnterior = anterior
      ? (esCompra
          ? formatoMonto(anterior.monto_enviado, anterior.moneda_origen_codigo, decimales)
          : formatoMonto(anterior.monto_recibido, anterior.moneda_destino_codigo, decimales))
      : ''
    const ocupado = creando || cancelando

    return (
      <div className="max-w-lg mx-auto animate-fadein">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8">
          <h2 className="text-lg font-bold text-slate-900 mb-6" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
            {cambio ? 'La cotización cambió' : 'Confirmar operación'}
          </h2>

          <div className="flex items-center gap-4 p-4 rounded-xl bg-slate-50 mb-6">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold ${esCompra ? 'bg-emerald-500' : 'bg-blue-500'}`}>
              {esCompra ? '↑' : '↓'}
            </div>
            <div>
              <div className="font-bold text-slate-900 text-[15px]">{esCompra ? 'Compra' : 'Venta'} de {divisa}</div>
              <div className="text-[13px] text-slate-400">Cliente: {nombreCliente}</div>
            </div>
          </div>

          {mostrarErrorCliente && (
            <p role="alert" className="mb-4 text-red-600 text-[13px] font-medium">{clienteMotivo}</p>
          )}

          {cambio && anterior ? (
            <div role="alert" className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-[13px] text-amber-800 font-medium mb-3">
                La tasa se actualizó mientras confirmabas. Revisá el nuevo total: podés aceptarlo o cancelar sin costo.
              </p>
              <div className="grid grid-cols-2 gap-3 text-[12px]">
                <div>
                  <div className="text-amber-700/70">Tipo efectivo anterior</div>
                  <div className="font-mono text-slate-500 line-through">{anterior.cotizacion_aplicada.toLocaleString('es-PY')}</div>
                </div>
                <div>
                  <div className="text-amber-700/70">Tipo efectivo nuevo</div>
                  <div className="font-mono font-semibold text-slate-900">{op.cotizacion_aplicada.toLocaleString('es-PY')}</div>
                </div>
                <div>
                  <div className="text-amber-700/70">{totalLabel} anterior</div>
                  <div className="font-mono text-slate-500 line-through">{totalAnterior}</div>
                </div>
                <div>
                  <div className="text-amber-700/70">{totalLabel} nuevo</div>
                  <div className="font-mono font-semibold text-slate-900">{totalValor}</div>
                </div>
              </div>
            </div>
          ) : (
            <p className={`mb-6 text-[13px] ${segundos > 0 ? 'text-slate-500' : 'text-amber-700'}`} aria-live="polite">
              {segundos > 0
                ? `Tasa garantizada por ${segundos} s más.`
                : 'La tasa garantizada venció. Si cambió al confirmar, te mostramos la nueva antes de cobrar.'}
            </p>
          )}

          <div className="space-y-3 mb-6">
            {[
              ['Envías', formatoMonto(op.monto_enviado, op.moneda_origen_codigo, decimales)],
              ['Recibís', formatoMonto(op.monto_recibido, op.moneda_destino_codigo, decimales)],
              ['Tipo efectivo', `${op.cotizacion_aplicada.toLocaleString('es-PY')} ${op.moneda_origen_codigo}/${op.moneda_destino_codigo}`],
            ].map(([label, value]) => (
              <div key={label as string} className="flex justify-between py-2 border-b border-slate-50 last:border-0">
                <span className="text-[13px] text-slate-500">{label}</span>
                <span className="font-mono font-semibold text-slate-800 text-[13px]">{value}</span>
              </div>
            ))}
            <div className="flex justify-between py-3 bg-emerald-50 rounded-xl px-4 -mx-4">
              <span className="text-[14px] font-bold text-emerald-700">{totalLabel}</span>
              <span className="font-mono font-extrabold text-emerald-700 text-[16px]">{totalValor}</span>
            </div>
          </div>

          {errorPost && <p role="alert" className="mb-4 text-red-600 text-[13px] font-medium">{errorPost}</p>}

          <div className="flex gap-3">
            {cambio ? (
              <button
                onClick={() => cancelar('COTIZACION_CAMBIADA')}
                disabled={ocupado}
                className="flex-1 py-3 rounded-xl border border-red-200 text-[14px] font-semibold text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {cancelando ? 'Cancelando…' : 'Cancelar transacción'}
              </button>
            ) : (
              <button
                onClick={() => cancelar('DESISTIO')}
                disabled={ocupado}
                className="flex-1 py-3 rounded-xl border border-slate-200 text-[14px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {cancelando ? 'Volviendo…' : 'Volver'}
              </button>
            )}
            <button
              onClick={confirmar}
              disabled={!clienteOk || ocupado}
              title={!clienteOk ? clienteMotivo : undefined}
              className="flex-1 py-3 rounded-xl text-white text-[14px] font-semibold transition-all hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
              style={{ background: 'linear-gradient(135deg,#0f3460,#10b981)' }}
            >
              {creando
                ? 'Procesando…'
                : cambio
                  ? 'Aceptar nueva cotización'
                  : `Confirmar ${esCompra ? 'compra' : 'venta'}`}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto animate-fadein">
      <div className="flex rounded-xl border border-slate-200 bg-white p-1 mb-6 shadow-sm">
        <button
          onClick={() => setMode('buy')}
          className={`flex-1 py-3 rounded-lg text-[14px] font-semibold transition-all flex items-center justify-center gap-2 ${mode === 'buy' ? 'text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          style={mode === 'buy' ? { background: 'linear-gradient(135deg,#0f3460,#10b981)' } : {}}
        >
          <span>↑</span> Comprar divisas
        </button>
        <button
          onClick={() => setMode('sell')}
          className={`flex-1 py-3 rounded-lg text-[14px] font-semibold transition-all flex items-center justify-center gap-2 ${mode === 'sell' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          <span>↓</span> Vender divisas
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8">
        <h2 className="font-bold text-slate-900 text-lg mb-6" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
          {mode === 'buy' ? 'Comprar divisas' : 'Vender divisas'}
        </h2>

        {tasasUtiles.length === 0 && (
          <p role="alert" className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
            No hay cotizaciones vigentes para las monedas activas. Pedí al administrador que habilite monedas y registre sus tasas.
          </p>
        )}

        <div className="space-y-5">
          <div>
            <label className="block text-[12px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Cliente</label>
            <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border bg-slate-50 ${mostrarErrorCliente ? 'border-red-300' : 'border-slate-200'}`}>
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-400 to-blue-500 flex items-center justify-center text-white text-xs font-bold">{nombreCliente.charAt(0)}</div>
              <span className="text-[14px] font-medium text-slate-800">{nombreCliente}</span>
            </div>
            {mostrarErrorCliente && (
              <p role="alert" className="mt-2 text-red-600 text-[13px] font-medium">{clienteMotivo}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[12px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
                {mode === 'buy' ? 'Moneda a comprar' : 'Moneda a vender'}
              </label>
              <select value={divisa} onChange={e => setDivisa(e.target.value)} className="w-full border border-slate-200 rounded-xl px-4 py-3 text-[14px] font-medium text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300">
                {opcionesDivisa.map(r => <option key={r.moneda} value={r.moneda} disabled={r.sinTasa}>{r.flag} {r.moneda} — {r.nombre}{r.sinTasa ? ' (sin cotización)' : ''}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
                {mode === 'buy' ? 'Pagar con' : 'Recibir en'}
              </label>
              <select value={contraparte} onChange={e => setContraparte(e.target.value)} className="w-full border border-slate-200 rounded-xl px-4 py-3 text-[14px] font-medium text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300">
                {contrapartes.map(c => <option key={c.moneda} value={c.moneda} disabled={c.sinTasa}>{c.flag} {c.moneda} — {c.nombre}{c.sinTasa ? ' (sin cotización)' : ''}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[12px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Monto ({divisa})
            </label>
            <div className="relative">
              <input
                type="number"
                min={0}
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
                className={`w-full border rounded-xl px-4 py-3.5 text-[16px] font-mono font-semibold text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300 placeholder:text-slate-200 ${mostrarErrorCliente ? 'border-red-300' : 'border-slate-200'}`}
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex gap-2">
                {['100', '500', '1000'].map(v => (
                  <button key={v} onClick={() => setAmount(v)} className="text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-1 rounded hover:bg-emerald-100 transition-colors">
                    {v}
                  </button>
                ))}
              </div>
            </div>
            {mostrarErrorCliente && (
              <p role="alert" className="mt-2 text-red-600 text-[13px] font-medium">{clienteMotivo}</p>
            )}
          </div>

          {mode === 'buy' && (
            <div>
              <label className="block text-[12px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Método de pago</label>
              <div className="grid grid-cols-4 gap-2">
                {(metodos.length > 0
                  ? metodos.map(m => ({ id: m.codigo, icon: '🏦', label: m.nombre }))
                  : [
                      { id: 'transfer', icon: '🏦', label: 'Transferencia' },
                      { id: 'wallet', icon: '◈', label: 'Billetera' },
                      { id: 'card', icon: '💳', label: 'Tarjeta' },
                      { id: 'qr', icon: '⊞', label: 'QR' },
                    ]
                ).map(m => (
                  <button
                    key={m.id}
                    onClick={() => setPaymentMethod(m.id)}
                    className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border text-center transition-all ${paymentMethod === m.id ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 hover:border-slate-300'}`}
                  >
                    <span className="text-xl">{m.icon}</span>
                    <span className={`text-[11px] font-semibold ${paymentMethod === m.id ? 'text-emerald-600' : 'text-slate-500'}`}>{m.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* PI-73: de dónde salen y adónde van los fondos. */}
          <div className="space-y-3">
            {requiereCuenta && (
              <div>
                <label htmlFor="fondos-origen" className="block text-[12px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Cuenta bancaria ({codigoOrigen})
                </label>
                <select
                  id="fondos-origen"
                  value={origenSel}
                  onChange={e => setOrigenSel(e.target.value)}
                  disabled={!currentClient}
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 text-[14px] font-medium text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300 disabled:opacity-60"
                >
                  <option value="">Elegí tu cuenta bancaria</option>
                  {opcionesOrigenCuenta.map(c => (
                    <option key={c.id} value={`C:${c.id}`}>🏦 {c.bank} · {c.account}</option>
                  ))}
                </select>
                {opcionesOrigenCuenta.length === 0 && (
                  <p className="mt-2 text-amber-600 text-[12px]">No tenés cuentas activas en {codigoOrigen}. Vinculá una en Bancos.</p>
                )}
              </div>
            )}
            {pagaConBilletera && (
              <p className="text-[13px] text-slate-600">
                👛 Se descontará de tu billetera {codigoOrigen}
                {billeteraOrigen ? ` (saldo ${billeteraOrigen.saldo.toLocaleString()})` : ''}.
              </p>
            )}
            <p className="text-[13px] text-slate-600">
              👛 Lo recibido se acreditará en tu billetera {codigoDestino}
              {billeteraDestino ? ` (saldo ${billeteraDestino.saldo.toLocaleString()})` : ''}.
            </p>
          </div>

          {simulando && amountNum > 0 && (
            <p className="text-slate-400 text-[13px]">Calculando precio final…</p>
          )}
          {simError && <p role="alert" className="text-red-600 text-[13px] font-medium">{simError}</p>}

          {amountNum > 0 && resumen && (
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 space-y-2.5 animate-fadein">
              <h4 className="font-semibold text-slate-700 text-[13px] mb-3">Resumen de la operación</h4>
              {[
                ['Tasa final', `${resumen.tasaEfectiva.toLocaleString()} ${resumen.monedaOrigen}/${resumen.monedaDestino}`],
              ].map(([label, value]) => (
                <div key={label as string} className="flex justify-between">
                  <span className="text-[12px] text-slate-400">{label}</span>
                  <span className="font-mono font-semibold text-slate-700 text-[12px]">{value}</span>
                </div>
              ))}
              <div className="border-t border-slate-200 pt-2.5 flex justify-between">
                <span className="text-[13px] font-bold text-slate-700">Total a {resumen.totalTipo === 'pagar' ? 'pagar' : 'recibir'}</span>
                <span className="font-mono font-extrabold text-emerald-600 text-[15px]">{resumen.total.toLocaleString()} {resumen.totalTipo === 'pagar' ? resumen.monedaOrigen : resumen.monedaDestino}</span>
              </div>
            </div>
          )}

          {errorPost && <p role="alert" className="text-red-600 text-[13px] font-medium">{errorPost}</p>}

          <button
            onClick={iniciar}
            disabled={bloqueado || iniciando}
            title={mostrarErrorCliente ? clienteMotivo : undefined}
            className="w-full py-4 rounded-xl text-white font-semibold text-[15px] transition-all hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
            style={{ background: 'linear-gradient(135deg,#0f3460,#10b981)' }}
          >
            {iniciando ? 'Congelando cotización…' : 'Continuar →'}
          </button>
        </div>
      </div>
    </div>
  )
}
