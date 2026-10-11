/**
 * Panel operativo del cajero.
 *
 * Permite al cajero registrar o identificar clientes presenciales, realizar
 * operaciones de compra/venta de divisas, emitir comprobantes legales y
 * gestionar el arqueo de caja de la sucursal.
 *
 * PI-45: la identificación de clientes ya consulta la API real. El cajero
 * busca por documento y, si no existe, lo registra desde el modal; el
 * cliente nuevo queda seleccionado para la transacción.
 * PI-42: la emisión es real — crea y confirma la operación en efectivo
 * en nombre del cliente y emite el comprobante interno (único, guardado
 * y reimprimible). La factura electrónica/DNIT corresponde a otro PI.
 * PI-75: la operación presencial se ejecuta en el servidor en una sola
 * transacción (`POST /api/cajas/{id}/operacion/`): crea la operación
 * PAGADA, mueve el efectivo (siempre el RETIRO de lo entregado; el
 * INGRESO solo si paga en efectivo) y emite el comprobante. El panel
 * muestra el desglose previo, el historial limitado a 10 con "Ver todo"
 * hacia Transacciones, y anula por endpoint con reversa atómica.
 *
 * @module CashierDashboard
 */
import React, { useEffect, useState } from 'react'
import { type AuthUser, type Page, type ClienteActivo } from '../../types'
import { currencies } from '@/data/mockData'
import {
  buscarClientePorDocumento,
  registrarClientePresencial,
  type Cliente,
} from '@/services/clientes'
import {
  anularComprobante,
  listarComprobantes,
  obtenerComprobante,
  type Comprobante,
} from '@/services/comprobantes'
import {
  MEDIOS_PAGO,
  cotizarOperacion,
  ejecutarOperacion,
  type CotizacionVentanilla,
  type MedioPago,
} from '@/services/cajasOperacion'
import { listarCajas, type Caja } from '@/services/cajas'
import ComprobanteVista from '@/components/ComprobanteVista'

export interface Props {
  auth: AuthUser
  currentClient: ClienteActivo | null
  navigate: (p: Page) => void
}

/** Cliente presencial identificado en ventanilla (PI-45). */
interface Client {
  id: number
  name: string
  document: string
  email: string
  phone: string
  tipo: string
}

type DivisaCodigo = (typeof currencies)[number]['code']

export default function CashierDashboard({ auth, currentClient, navigate }: Props) {
  const [searchDoc, setSearchDoc] = useState('')
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')

  const [showRegisterModal, setShowRegisterModal] = useState(false)
  const [registerError, setRegisterError] = useState('')
  const [savingClient, setSavingClient] = useState(false)
  const [newClient, setNewClient] = useState({
    name: '',
    lastName: '',
    document: '',
    email: '',
    phone: '',
    type: 'FISICA' as 'FISICA' | 'JURIDICA',
  })

  /** Traduce la respuesta del backend a la vista del panel. */
  function aCliente(c: Cliente): Client {
    return {
      id: c.id,
      name: c.nombre_completo || c.nombre,
      document: c.documento,
      email: c.email,
      phone: c.telefono,
      tipo: c.tipo_display,
    }
  }

  const [operationType, setOperationType] = useState<'buy' | 'sell'>('buy')
  const [originCurrency, setOriginCurrency] = useState<DivisaCodigo>('PYG')
  const [destinationCurrency, setDestinationCurrency] = useState<DivisaCodigo>('USD')
  const [amount, setAmount] = useState<number | ''>('')
  const [docType, setDocType] = useState<'Comprobante'>('Comprobante')

  // PI-75: la caja en la que se opera y el medio de pago en ventanilla.
  const [cajas, setCajas] = useState<Caja[]>([])
  const [cajaId, setCajaId] = useState<number | ''>('')
  const [medioPago, setMedioPago] = useState<MedioPago>('efectivo')
  const [cotizacion, setCotizacion] = useState<CotizacionVentanilla | null>(null)
  const [cotizando, setCotizando] = useState(false)

  const cajaActual = cajas.find((c) => c.id === cajaId) ?? null

  useEffect(() => {
    listarCajas()
      .then((lista) => {
        setCajas(lista)
        // Preselecciona la primera caja abierta; si no hay ninguna, la
        // primera disponible, para que se vea el aviso de caja cerrada.
        const preferida = lista.find((c) => c.abierta) ?? lista[0]
        if (preferida) setCajaId(preferida.id)
      })
      .catch(() => setEmitError('No se pudieron cargar las cajas.'))
  }, [])

  const handleOperationTypeChange = (value: 'buy' | 'sell') => {
    setOperationType(value)
    if (value === 'buy') {
      setOriginCurrency('PYG')
      setDestinationCurrency((previous) => (previous === 'PYG' ? 'USD' : previous))
    } else {
      setOriginCurrency((previous) => (previous === 'PYG' ? 'USD' : previous))
      setDestinationCurrency('PYG')
    }
  }

  /** Divisa que el cliente compra o vende (la que opera el backend). */
  const divisaOperada = operationType === 'buy' ? destinationCurrency : originCurrency
  const contraparte = operationType === 'buy' ? originCurrency : destinationCurrency

  /** PI-75: pide el desglose al backend; no crea nada. */
  const refetchCotizacion = async () => {
    if (!cajaId || !selectedClient || !amount || amount <= 0) {
      setCotizacion(null)
      return
    }
    setCotizando(true)
    try {
      setCotizacion(await cotizarOperacion(cajaId, {
        cliente: selectedClient.id,
        tipo_operacion: operationType === 'buy' ? 'COMPRA' : 'VENTA',
        moneda: divisaOperada,
        monto_divisa: String(amount),
        moneda_contraparte: contraparte,
        medio_pago: medioPago,
      }))
    } catch (err) {
      setCotizacion(null)
      setEmitError(err instanceof Error ? err.message : 'No se pudo cotizar.')
    } finally {
      setCotizando(false)
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => { void refetchCotizacion() }, 350)
    return () => clearTimeout(timer)
  }, [cajaId, selectedClient, operationType, divisaOperada, contraparte, amount])

  // PI-42: historial real de comprobantes emitidos (reimprimibles).
  const [comprobantes, setComprobantes] = useState<Comprobante[]>([])
  const [emitiendo, setEmitiendo] = useState(false)
  const [emitError, setEmitError] = useState('')
  const [emitInfo, setEmitInfo] = useState('')
  const [comprobanteActual, setComprobanteActual] = useState<Comprobante | null>(null)
  const [anulandoId, setAnulandoId] = useState<number | null>(null)

  useEffect(() => {
    listarComprobantes().then(setComprobantes).catch(() => {})
  }, [])

  async function recargarComprobantes() {
    try {
      setComprobantes(await listarComprobantes())
    } catch {
      // El historial es secundario: no bloquea la emisión.
    }
  }

  /** PI-75: ejecuta la operación presencial completa en una transacción. */
  const handleEmitInvoice = async () => {
    if (!selectedClient) {
      setEmitError('Seleccione un cliente antes de procesar.')
      return
    }
    if (!cajaId) {
      setEmitError('Seleccione una caja abierta.')
      return
    }
    if (originCurrency === destinationCurrency) {
      setEmitError('La divisa origen y la divisa destino deben ser distintas.')
      return
    }
    if (!amount || amount <= 0) {
      setEmitError('Ingrese un monto válido.')
      return
    }
    setEmitiendo(true)
    setEmitError('')
    setEmitInfo('')
    try {
      const resultado = await ejecutarOperacion(cajaId, {
        cliente: selectedClient.id,
        tipo_operacion: operationType === 'buy' ? 'COMPRA' : 'VENTA',
        moneda: divisaOperada,
        monto_divisa: String(amount),
        moneda_contraparte: contraparte,
        medio_pago: medioPago,
      })
      if (resultado.comprobante) {
        const completo = await obtenerComprobante(resultado.comprobante.id)
        setComprobanteActual(completo)
      }
      const movimientos = resultado.movimientos
        .map((m) => `${m.tipo_display} ${m.total} ${m.moneda_codigo}`)
        .join(' · ')
      setEmitInfo(`Operación #${resultado.operacion.id} registrada. Caja: ${movimientos}.`)
      setAmount('')
      setCotizacion(null)
      await recargarComprobantes()
    } catch (err) {
      setEmitError(err instanceof Error ? err.message : 'No se pudo registrar la operación.')
    } finally {
      setEmitiendo(false)
    }
  }

  const handleReimprimir = async (id: number) => {
    try {
      setComprobanteActual(await obtenerComprobante(id))
    } catch {
      setEmitError('No se pudo recuperar el comprobante.')
    }
  }

  /** Anula el comprobante: el servidor revierte caja y billeteras con
   * el par inverso, marca el comprobante como anulado y pasa la
   * operación a CANCELADA (todo o nada). No hay nota de crédito.
   */
  const handleAnular = async (comp: Comprobante) => {
    if (anulandoId != null || comp.estado === 'anulado') return
    setAnulandoId(comp.id)
    setEmitError('')
    setEmitInfo('')
    try {
      const anulado = await anularComprobante(comp.id)
      setComprobantes(prev => prev.map(c => (c.id === anulado.id ? anulado : c)))
      setEmitInfo(`Comprobante ${anulado.numero} anulado y revertido en caja.`)
    } catch (err) {
      setEmitError(err instanceof Error ? err.message : 'No se pudo anular el comprobante.')
    } finally {
      setAnulandoId(null)
    }
  }

  /** PI-45: busca por documento y confirma la identidad antes de operar. */
  const handleSearchClient = async () => {
    const documento = searchDoc.trim()
    if (!documento) {
      setSearchError('Ingrese el número de documento.')
      setSelectedClient(null)
      return
    }
    setSearching(true)
    setSearchError('')
    try {
      const r = await buscarClientePorDocumento(documento)
      if (r.encontrado && r.cliente) {
        setSelectedClient(aCliente(r.cliente))
      } else {
        setSelectedClient(null)
        setSearchError('El documento no está registrado. Puede registrarlo ahora.')
      }
    } catch (err) {
      setSelectedClient(null)
      setSearchError(err instanceof Error ? err.message : 'No se pudo consultar el documento.')
    } finally {
      setSearching(false)
    }
  }

  const openRegister = (documento = '') => {
    setRegisterError('')
    setNewClient((prev) => ({ ...prev, document: documento || prev.document }))
    setShowRegisterModal(true)
  }

  /** PI-45: al guardar, el cliente nuevo queda seleccionado para operar. */
  const handleRegisterClient = async (e: React.FormEvent) => {    e.preventDefault()
    setSavingClient(true)
    setRegisterError('')
    try {
      const creado = await registrarClientePresencial({
        nombre: newClient.name.trim(),
        apellido: newClient.lastName.trim(),
        documento: newClient.document.trim(),
        email: newClient.email.trim(),
        telefono: newClient.phone.trim(),
        tipo: newClient.type,
      })
      setSelectedClient(aCliente(creado))
      setSearchDoc(creado.documento)
      setShowRegisterModal(false)
      setNewClient({ name: '', lastName: '', document: '', email: '', phone: '', type: 'FISICA' })
    } catch (err) {
      setRegisterError(err instanceof Error ? err.message : 'No se pudo registrar el cliente.')
    } finally {
      setSavingClient(false)
    }
  }

  return (
    <div className="space-y-6 animate-fadein text-slate-800">
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Identificación de Cliente */}
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 space-y-4">
          <h3 className="font-semibold text-slate-900 border-b pb-2 flex justify-between items-center">
            <span>👤 Cliente en Ventanilla</span>
            <button onClick={() => openRegister()} className="text-xs text-emerald-600 font-bold hover:underline">
              + Nuevo Cliente
            </button>
          </h3>

          <div className="space-y-2">
            <label htmlFor="doc-buscar" className="text-xs font-semibold text-slate-500">Documento de Identidad</label>
            <div className="flex gap-2 w-full">
              <input
                id="doc-buscar"
                type="text"
                placeholder="Ej. 4589201"
                value={searchDoc}
                onChange={(e) => { setSearchDoc(e.target.value); setSearchError('') }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleSearchClient() } }}
                className="flex-1 min-w-0 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button
                onClick={handleSearchClient}
                disabled={searching}
                className="shrink-0 px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white rounded-lg text-sm font-semibold transition-colors"
              >
                {searching ? 'Buscando…' : 'Buscar'}
              </button>
            </div>
          </div>

          {searchError && (
            <div role="alert" className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-3 text-xs space-y-2">
              <div>{searchError}</div>
              <button onClick={() => openRegister(searchDoc.trim())} className="font-bold text-emerald-700 hover:underline">
                Registrar cliente →
              </button>
            </div>
          )}

          {selectedClient ? (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1">
              <div className="text-xs text-emerald-600 font-bold">✓ Cliente Seleccionado</div>
              <div className="font-bold text-slate-900">{selectedClient.name}</div>
              <div className="text-xs text-slate-500">Doc: {selectedClient.document}</div>
              <div className="text-xs text-slate-500">Tipo: {selectedClient.tipo}</div>
              <div className="text-xs text-slate-500">Email: {selectedClient.email}</div>
              {selectedClient.phone && (
                <div className="text-xs text-slate-500">Tel: {selectedClient.phone}</div>
              )}
            </div>
          ) : (
            !searchError && (
              <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-3 text-xs">
                Sin cliente seleccionado.
              </div>
            )
          )}
        </div>

        {/* Transacción Cambiaria */}
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 space-y-4 lg:col-span-2">
          <h3 className="font-semibold text-slate-900 border-b pb-2">💱 Operación Cambiaria & Emisión</h3>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="divisa-origen" className="text-xs font-semibold text-slate-500">Divisa origen</label>
              <select
                id="divisa-origen"
                value={originCurrency}
                onChange={(e) => setOriginCurrency(e.target.value as DivisaCodigo)}
                className="w-full mt-1 p-2 border rounded-lg text-sm"
              >
                {currencies
                  .filter((currency) => currency.active && currency.code !== destinationCurrency)
                  .map((currency) => (
                    <option key={currency.code} value={currency.code}>
                      {currency.code} - {currency.name}
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label htmlFor="divisa-destino" className="text-xs font-semibold text-slate-500">Divisa destino</label>
              <select
                id="divisa-destino"
                value={destinationCurrency}
                onChange={(e) => setDestinationCurrency(e.target.value as DivisaCodigo)}
                className="w-full mt-1 p-2 border rounded-lg text-sm"
              >
                {currencies
                  .filter((currency) => currency.active && currency.code !== originCurrency)
                  .map((currency) => (
                    <option key={currency.code} value={currency.code}>
                      {currency.code} - {currency.name}
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label htmlFor="tipo-operacion" className="text-xs font-semibold text-slate-500">Tipo Operación</label>
              <select
                id="tipo-operacion"
                value={operationType}
                onChange={(e) => handleOperationTypeChange(e.target.value as 'buy' | 'sell')}
                className="w-full mt-1 p-2 border rounded-lg text-sm"
              >
                <option value="buy">Compra de Divisas</option>
                <option value="sell">Venta de Divisas</option>
              </select>
            </div>

            <div>
              <label htmlFor="monto-operacion" className="text-xs font-semibold text-slate-500">
                Monto ({originCurrency})
              </label>
              <input
                id="monto-operacion"
                type="number"
                min="0"
                step="any"
                placeholder="100"
                value={amount}
                onChange={(e) => setAmount(e.target.value ? Number(e.target.value) : '')}
                className="w-full mt-1 p-2 border rounded-lg text-sm"
              />
            </div>

            <div>
              <label htmlFor="medio-pago" className="text-xs font-semibold text-slate-500">Medio de Pago</label>
              <select
                id="medio-pago"
                value={medioPago}
                onChange={(e) => setMedioPago(e.target.value as MedioPago)}
                className="w-full mt-1 p-2 border rounded-lg text-sm"
              >
                {MEDIOS_PAGO.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
              <p className="text-[11px] text-slate-400 mt-1">
                Solo el efectivo suma a la caja; con tarjeta o transferencia
                la caja registra únicamente la divisa entregada.
              </p>
            </div>

            <div className="md:col-span-2">
              <label htmlFor="caja-operacion" className="text-xs font-semibold text-slate-500">Caja</label>
              <select
                id="caja-operacion"
                value={cajaId}
                onChange={(e) => setCajaId(e.target.value ? Number(e.target.value) : '')}
                className="w-full mt-1 p-2 border rounded-lg text-sm font-semibold"
              >
                <option value="">Seleccione una caja…</option>
                {cajas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre} · {c.sucursal} {c.abierta ? '(abierta)' : '(cerrada)'}
                  </option>
                ))}
              </select>
              {cajaActual && !cajaActual.abierta && (
                <p role="alert" className="text-[11px] text-amber-700 font-semibold mt-1">
                  Esta caja está cerrada. Solo se puede operar con una caja abierta.
                </p>
              )}
            </div>

            <div className="md:col-span-2">
              <label htmlFor="comprobante-legal" className="text-xs font-semibold text-slate-500">Comprobante</label>
              <select
                id="comprobante-legal"
                value={docType}
                onChange={(e) => setDocType(e.target.value as 'Comprobante')}
                className="w-full mt-1 p-2 border rounded-lg text-sm font-semibold"
              >
                <option value="Comprobante">Comprobante</option>
              </select>
              <p className="text-[11px] text-slate-400 mt-1">Comprobante interno de la operación (no es factura electrónica).</p>
            </div>
          </div>

          {/* PI-75: desglose antes de confirmar, calculado por el backend. */}
          {cotizando && (
            <p className="text-slate-400 text-[13px]">Calculando precio final…</p>
          )}
          {cotizacion && !cotizando && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 space-y-1">
              <div className="text-xs font-semibold text-slate-600">Desglose de la operación</div>
              <div className="flex justify-between text-[13px]">
                <span className="text-slate-500">El cliente paga</span>
                <span className="font-mono font-semibold text-slate-800">{cotizacion.cliente_paga}</span>
              </div>
              <div className="flex justify-between text-[13px]">
                <span className="text-slate-500">El cliente recibe</span>
                <span className="font-mono font-semibold text-emerald-700">{cotizacion.cliente_recibe}</span>
              </div>
              <div className="flex justify-between text-[13px]">
                <span className="text-slate-500">Tasa aplicada</span>
                <span className="font-mono text-slate-700">
                  {Number(cotizacion.tasa_aplicada).toLocaleString('es-PY')}
                </span>
              </div>
              {!cotizacion.saldo_suficiente && (
                <p role="alert" className="text-[12px] text-rose-600 font-semibold">
                  La caja no tiene saldo suficiente de {cotizacion.moneda_destino_codigo}
                  {' '}(tiene {cotizacion.saldo_disponible}).
                </p>
              )}
            </div>
          )}

          {emitError && (
            <p role="alert" className="bg-rose-50 border border-rose-200 text-rose-700 rounded-lg p-3 text-xs font-semibold">
              {emitError}
            </p>
          )}
          {emitInfo && (
            <p className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-3 text-xs font-semibold">
              {emitInfo}
            </p>
          )}

          <button
            onClick={handleEmitInvoice}
            disabled={emitiendo || cotizando || (cotizacion !== null && !cotizacion.saldo_suficiente)}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold rounded-lg text-sm shadow transition-all"
          >
            {emitiendo ? 'Procesando…' : '🖨️ Procesar, Emitir e Imprimir'}
          </button>
        </div>
      </div>

      {/* Historial real de comprobantes internos (PI-42): últimos 10 en el
          panel; el listado completo vive en Transacciones. */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 space-y-4">
        <h3 className="font-semibold text-slate-900 border-b pb-2 flex items-center justify-between">
          <span>📋 Historial de Comprobantes Internos</span>
          <button
            onClick={() => navigate('transactions')}
            className="text-[12px] text-emerald-600 font-semibold hover:text-emerald-700"
          >
            Ver todo →
          </button>
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b text-slate-500">
                <th className="p-3">N° Comprobante</th>
                <th className="p-3">Cliente</th>
                <th className="p-3">Tipo</th>
                <th className="p-3">Monto</th>
                <th className="p-3">Fecha</th>
                <th className="p-3">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {comprobantes.length === 0 && (
                <tr><td colSpan={6} className="p-4 text-center text-slate-400">Sin comprobantes emitidos.</td></tr>
              )}
              {comprobantes.slice(0, 10).map((comp) => (
                <tr key={comp.id} className="border-b hover:bg-slate-50">
                  <td className="p-3 font-bold">
                    {comp.numero}
                    {comp.estado === 'anulado' && (
                      <span className="ml-2 text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-slate-100 text-slate-600 border-slate-200">
                        Anulada
                      </span>
                    )}
                  </td>
                  <td className="p-3">{comp.cliente_nombre} ({comp.cliente_documento})</td>
                  <td className="p-3"><span className="px-2 py-1 rounded bg-slate-100 font-semibold">{comp.tipo_operacion}</span></td>
                  <td className="p-3 font-semibold">
                    {comp.monto_enviado.toLocaleString()} {comp.moneda_origen_codigo} → {comp.monto_recibido.toLocaleString()} {comp.moneda_destino_codigo}
                  </td>
                  <td className="p-3 text-slate-500">{new Date(comp.fecha_operacion).toLocaleString()}</td>
                  <td className="p-3">
                    <div className="flex gap-2">
                      <button onClick={() => handleReimprimir(comp.id)} className="px-2 py-1 bg-slate-900 text-white rounded font-semibold text-[11px]">
                        🖨️ Reimprimir
                      </button>
                      <button
                        onClick={() => handleAnular(comp)}
                        disabled={anulandoId === comp.id || comp.estado === 'anulado'}
                        className="px-2 py-1 bg-rose-50 border border-rose-200 text-rose-600 rounded font-semibold text-[11px] disabled:opacity-60"
                      >
                        {anulandoId === comp.id
                          ? 'Anulando…'
                          : comp.estado === 'anulado'
                            ? 'Anulada'
                            : 'Solicitar NC / Anulación'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {comprobantes.length > 10 && (
          <p className="text-[12px] text-slate-400 text-right">
            Mostrando los últimos 10 de {comprobantes.length}.{' '}
            <button onClick={() => navigate('transactions')} className="text-emerald-600 font-semibold hover:text-emerald-700">
              Ver todo →
            </button>
          </p>
        )}
      </div>

      {/* Vista imprimible del comprobante recién emitido o reimpreso */}
      {comprobanteActual && (
        <ComprobanteVista comprobante={comprobanteActual} onClose={() => setComprobanteActual(null)} />
      )}

      {/* Modal Registro Cliente */}
      {showRegisterModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex justify-center items-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
            <h3 className="font-bold text-lg text-slate-900">Registro de Cliente Presencial</h3>
            <form onSubmit={handleRegisterClient} className="space-y-3 text-sm">
              {registerError && (
                <p role="alert" className="text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-2 text-xs">
                  {registerError}
                </p>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="cli-nombre" className="text-xs font-semibold text-slate-500">Nombre</label>
                  <input
                    id="cli-nombre" required type="text"
                    className="w-full p-2 border rounded-lg mt-1"
                    value={newClient.name}
                    onChange={(e) => setNewClient({ ...newClient, name: e.target.value })}
                  />
                </div>
                <div>
                  <label htmlFor="cli-apellido" className="text-xs font-semibold text-slate-500">Apellido</label>
                  <input
                    id="cli-apellido" required={newClient.type === 'FISICA'} type="text"
                    className="w-full p-2 border rounded-lg mt-1"
                    value={newClient.lastName}
                    onChange={(e) => setNewClient({ ...newClient, lastName: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label htmlFor="cli-tipo" className="text-xs font-semibold text-slate-500">Tipo de Cliente</label>
                <select
                  id="cli-tipo"
                  className="w-full p-2 border rounded-lg mt-1"
                  value={newClient.type}
                  onChange={(e) => setNewClient({ ...newClient, type: e.target.value as 'FISICA' | 'JURIDICA' })}
                >
                  <option value="FISICA">Persona física</option>
                  <option value="JURIDICA">Persona jurídica</option>
                </select>
              </div>
              <div>
                <label htmlFor="cli-doc" className="text-xs font-semibold text-slate-500">
                  {newClient.type === 'FISICA' ? 'N° Documento' : 'RUC'}
                </label>
                <input
                  id="cli-doc" required type="text"
                  className="w-full p-2 border rounded-lg mt-1"
                  value={newClient.document}
                  onChange={(e) => setNewClient({ ...newClient, document: e.target.value })}
                />
              </div>
              <div>
                <label htmlFor="cli-email" className="text-xs font-semibold text-slate-500">Correo Electrónico</label>
                <input
                  id="cli-email" required type="email"
                  className="w-full p-2 border rounded-lg mt-1"
                  value={newClient.email}
                  onChange={(e) => setNewClient({ ...newClient, email: e.target.value })}
                />
              </div>
              <div>
                <label htmlFor="cli-tel" className="text-xs font-semibold text-slate-500">
                  Teléfono {newClient.type === 'FISICA' && <span className="text-rose-500">(obligatorio)</span>}
                </label>
                <input
                  id="cli-tel" required={newClient.type === 'FISICA'} type="text"
                  className="w-full p-2 border rounded-lg mt-1"
                  value={newClient.phone}
                  onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })}
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button" onClick={() => setShowRegisterModal(false)}
                  className="flex-1 py-2 border rounded-lg text-slate-600 font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit" disabled={savingClient}
                  className="flex-1 py-2 bg-emerald-600 disabled:opacity-60 text-white rounded-lg font-semibold"
                >
                  {savingClient ? 'Guardando…' : 'Guardar y Seleccionar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}