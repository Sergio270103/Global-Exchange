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
  confirmarOperacion,
  crearOperacion,
} from '@/services/operaciones'
import {
  emitirComprobante,
  listarComprobantes,
  obtenerComprobante,
  type Comprobante,
} from '@/services/comprobantes'
import { vigentes } from '@/services/cotizaciones'
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

/** Tasas de referencia para mostrar el equivalente en guaraníes. */
const tasasPyg: Record<DivisaCodigo, number> = {
  PYG: 1,
  USD: 7350,
  EUR: 8250,
  BRL: 1380,
  ARS: 5.2,
  GBP: 9520,
}

function tasaEnPyg(codigo: DivisaCodigo): number {
  return tasasPyg[codigo] ?? 1
}

export default function CashierDashboard({ auth, currentClient }: Props) {
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
  const [docType, setDocType] = useState<'Factura' | 'Nota de Crédito'>('Factura')

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

  const totalPyg = Number(amount || 0) * tasaEnPyg(originCurrency)

  // PI-42: historial real de comprobantes emitidos (reimprimibles).
  const [comprobantes, setComprobantes] = useState<Comprobante[]>([])
  const [emitiendo, setEmitiendo] = useState(false)
  const [emitError, setEmitError] = useState('')
  const [emitInfo, setEmitInfo] = useState('')
  const [comprobanteActual, setComprobanteActual] = useState<Comprobante | null>(null)

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

  /** PI-42: emite el comprobante interno con operación real en efectivo. */
  const handleEmitInvoice = async () => {
    if (!selectedClient) {
      setEmitError('Seleccione un cliente antes de procesar.')
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
      // El monto se tipea en origen; el backend opera en la divisa.
      const extranjera = operationType === 'buy' ? destinationCurrency : originCurrency
      let montoDivisa: number
      if (originCurrency === extranjera) {
        montoDivisa = Number(amount)
      } else {
        const tasas = await vigentes()
        const tasa = tasas.find(t => t.moneda === extranjera)
        const venta = tasa ? tasa.venta : 0
        if (!(venta > 0)) throw new Error('No hay tasa vigente para la divisa.')
        montoDivisa = Number(amount) / venta
      }
      const operacion = await crearOperacion({
        clienteId: selectedClient.id,
        tipo: operationType === 'buy' ? 'COMPRA' : 'VENTA',
        moneda: extranjera,
        // El backend acepta como máximo 2 decimales en la divisa.
        montoDivisa: Math.round(montoDivisa * 100) / 100,
        monedaContraparte: operationType === 'buy' ? originCurrency : destinationCurrency,
        metodoPago: 'efectivo',
      })
      let confirmada = await confirmarOperacion(operacion.id)
      if (confirmada.resultado === 'COTIZACION_CAMBIADA') {
        // Reintento inmediato con la ventana nueva (ventanilla).
        confirmada = await confirmarOperacion(operacion.id)
      }
      if (confirmada.resultado !== 'CONFIRMADA') {
        throw new Error(confirmada.detail || 'No se pudo confirmar la operación.')
      }
      const comprobante = await emitirComprobante(confirmada.operacion.id)
      setComprobanteActual(comprobante)
      await recargarComprobantes()
    } catch (err) {
      setEmitError(err instanceof Error ? err.message : 'No se pudo emitir el comprobante.')
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

  const handleAnular = () => {
    setEmitInfo('La Nota de Crédito y la anulación fiscal corresponden al PI de facturación electrónica.')
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

            <div className="md:col-span-2">
              <label htmlFor="comprobante-legal" className="text-xs font-semibold text-slate-500">Comprobante Legal</label>
              <select
                id="comprobante-legal"
                value={docType}
                onChange={(e) => setDocType(e.target.value as 'Factura' | 'Nota de Crédito')}
                className="w-full mt-1 p-2 border rounded-lg text-sm font-semibold"
              >
                <option value="Factura">Factura Electrónica</option>
                <option value="Nota de Crédito">Nota de Crédito</option>
              </select>
            </div>
          </div>

          {amount && originCurrency !== destinationCurrency && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-right">
              <span className="text-xs text-slate-500 block">
                {originCurrency} → {destinationCurrency} · Total equivalente Guaraníes:
              </span>
              <span className="text-2xl font-bold text-emerald-700">
                {totalPyg.toLocaleString('es-PY')} ₲
              </span>
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

          <button onClick={handleEmitInvoice} disabled={emitiendo} className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold rounded-lg text-sm shadow transition-all">
            {emitiendo ? 'Procesando…' : '🖨️ Procesar, Emitir e Imprimir'}
          </button>
        </div>
      </div>

      {/* Historial real de comprobantes internos (PI-42) */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 space-y-4">
        <h3 className="font-semibold text-slate-900 border-b pb-2">📋 Historial de Comprobantes Internos</h3>

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
              {comprobantes.map((comp) => (
                <tr key={comp.id} className="border-b hover:bg-slate-50">
                  <td className="p-3 font-bold">{comp.numero}</td>
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
                      <button onClick={handleAnular} className="px-2 py-1 bg-rose-50 border border-rose-200 text-rose-600 rounded font-semibold text-[11px]">
                        Solicitar NC / Anulación
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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