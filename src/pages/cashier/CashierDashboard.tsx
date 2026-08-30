import React, { useState } from 'react'
import { type AuthUser, type Page } from '../../types'

interface Props {
  auth: AuthUser
  currentClient: string
  navigate: (p: Page) => void
}

interface Client {
  id: string
  name: string
  document: string
  email: string
  phone: string
}

export default function CashierDashboard({ auth, currentClient }: Props) {
  const [searchDoc, setSearchDoc] = useState('')
  const [selectedClient, setSelectedClient] = useState<Client | null>({
    id: '1',
    name: currentClient || 'Carlos Martínez',
    document: '4589201',
    email: 'carlos.martinez@email.com',
    phone: '0981123456',
  })

  const mockClients: Client[] = [
    { id: '1', name: 'Carlos Martínez', document: '4589201', email: 'carlos.martinez@email.com', phone: '0981123456' },
    { id: '2', name: 'María Benítez', document: '3820194', email: 'maria.b@email.com', phone: '0971987654' },
  ]

  const [showRegisterModal, setShowRegisterModal] = useState(false)
  const [newClient, setNewClient] = useState({ name: '', document: '', email: '', phone: '' })

  const [operationType, setOperationType] = useState<'buy' | 'sell'>('buy')
  const [currency, setCurrency] = useState('USD')
  const [amount, setAmount] = useState<number | ''>('')
  const [docType, setDocType] = useState<'Factura' | 'Nota de Crédito'>('Factura')
  const exchangeRate = 7350

  const [invoices, setInvoices] = useState([
    {
      id: 'INV-001',
      client: 'Carlos Martínez',
      doc: '4589201',
      type: 'Factura',
      amount: '$ 500',
      totalPyg: '3.675.000 ₲',
      dnitStatus: 'Enviado API',
      emailStatus: 'Enviado',
      date: '2026-08-28 09:15',
    },
  ])

  const handleSearchClient = () => {
    const found = mockClients.find((c) => c.document === searchDoc.trim())
    if (found) {
      setSelectedClient(found)
    } else {
      alert('Cliente no encontrado. Registre al usuario mediante el botón de nuevo cliente.')
      setSelectedClient(null)
    }
  }

  const handleRegisterClient = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newClient.name || !newClient.document) return
    const created: Client = { id: Date.now().toString(), ...newClient }
    setSelectedClient(created)
    setShowRegisterModal(false)
    setNewClient({ name: '', document: '', email: '', phone: '' })
    alert('Usuario presencial registrado correctamente.')
  }

  const handleEmitInvoice = () => {
    if (!selectedClient) {
      alert('Seleccione un cliente antes de procesar.')
      return
    }
    if (!amount || amount <= 0) {
      alert('Ingrese un monto válido.')
      return
    }

    const totalPyg = (Number(amount) * exchangeRate).toLocaleString('es-PY') + ' ₲'
    const newInv = {
      id: `INV-00${invoices.length + 1}`,
      client: selectedClient.name,
      doc: selectedClient.document,
      type: docType,
      amount: `${currency === 'USD' ? '$' : '€'} ${amount}`,
      totalPyg,
      dnitStatus: 'Enviado API',
      emailStatus: 'Enviado',
      date: new Date().toLocaleString(),
    }

    setInvoices([newInv, ...invoices])
    alert(`Comprobante (${docType}) emitido con éxito.`)
  }

  const handleAnular = (id: string) => {
    if (confirm(`¿Solicitar emisión de Nota de Crédito / Anulación sobre el comprobante ${id}?`)) {
      setInvoices(
        invoices.map((inv) =>
          inv.id === id ? { ...inv, type: 'Nota de Crédito (Anulada)', dnitStatus: 'Anulación DNIT' } : inv
        )
      )
    }
  }

  return (
    <div className="space-y-6 animate-fadein text-slate-800">
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Identificación de Cliente */}
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 space-y-4">
          <h3 className="font-semibold text-slate-900 border-b pb-2 flex justify-between items-center">
            <span>👤 Cliente en Ventanilla</span>
            <button onClick={() => setShowRegisterModal(true)} className="text-xs text-emerald-600 font-bold hover:underline">
              + Nuevo Cliente
            </button>
          </h3>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-500">Documento de Identidad</label>
            {/* Input y botón perfectamente integrados dentro de la tarjeta */}
            <div className="flex gap-2 w-full">
              <input
                type="text"
                placeholder="Ej. 4589201"
                value={searchDoc}
                onChange={(e) => setSearchDoc(e.target.value)}
                className="flex-1 min-w-0 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button
                onClick={handleSearchClient}
                className="shrink-0 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-semibold transition-colors"
              >
                Buscar
              </button>
            </div>
          </div>

          {selectedClient ? (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1">
              <div className="text-xs text-emerald-600 font-bold">✓ Cliente Seleccionado</div>
              <div className="font-bold text-slate-900">{selectedClient.name}</div>
              <div className="text-xs text-slate-500">Doc: {selectedClient.document}</div>
              <div className="text-xs text-slate-500">Email: {selectedClient.email}</div>
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-3 text-xs">
              Sin cliente seleccionado.
            </div>
          )}
        </div>

        {/* Transacción Cambiaria */}
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 space-y-4 lg:col-span-2">
          <h3 className="font-semibold text-slate-900 border-b pb-2">💱 Operación Cambiaria & Emisión</h3>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-500">Tipo Operación</label>
              <select value={operationType} onChange={(e) => setOperationType(e.target.value as any)} className="w-full mt-1 p-2 border rounded-lg text-sm">
                <option value="buy">Compra de Divisas</option>
                <option value="sell">Venta de Divisas</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500">Divisa</label>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="w-full mt-1 p-2 border rounded-lg text-sm">
                <option value="USD">USD - Dólares</option>
                <option value="EUR">EUR - Euros</option>
                <option value="BRL">BRL - Reales</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500">Monto</label>
              <input
                type="number"
                placeholder="100"
                value={amount}
                onChange={(e) => setAmount(e.target.value ? Number(e.target.value) : '')}
                className="w-full mt-1 p-2 border rounded-lg text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500">Comprobante Legal</label>
              <select value={docType} onChange={(e) => setDocType(e.target.value as any)} className="w-full mt-1 p-2 border rounded-lg text-sm font-semibold">
                <option value="Factura">Factura Electrónica</option>
                <option value="Nota de Crédito">Nota de Crédito</option>
              </select>
            </div>
          </div>

          {amount && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-right">
              <span className="text-xs text-slate-500 block">Total equivalente Guaraníes:</span>
              <span className="text-2xl font-bold text-emerald-700">
                {(Number(amount) * exchangeRate).toLocaleString('es-PY')} ₲
              </span>
            </div>
          )}

          <button onClick={handleEmitInvoice} className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-sm shadow transition-all">
            🖨️ Procesar, Emitir e Imprimir
          </button>
        </div>
      </div>

      {/* Control DNIT */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 space-y-4">
        <h3 className="font-semibold text-slate-900 border-b pb-2">📋 Historial de Comprobantes & API DNIT</h3>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b text-slate-500">
                <th className="p-3">N° Doc</th>
                <th className="p-3">Cliente</th>
                <th className="p-3">Comprobante</th>
                <th className="p-3">Monto Divisa</th>
                <th className="p-3">Monto PYG</th>
                <th className="p-3">Estado DNIT</th>
                <th className="p-3">Email Cliente</th>
                <th className="p-3">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} className="border-b hover:bg-slate-50">
                  <td className="p-3 font-bold">{inv.id}</td>
                  <td className="p-3">{inv.client} ({inv.doc})</td>
                  <td className="p-3"><span className="px-2 py-1 rounded bg-slate-100 font-semibold">{inv.type}</span></td>
                  <td className="p-3 font-semibold">{inv.amount}</td>
                  <td className="p-3 text-emerald-700 font-bold">{inv.totalPyg}</td>
                  <td className="p-3"><span className="text-emerald-600 font-semibold">✓ {inv.dnitStatus}</span></td>
                  <td className="p-3 text-slate-500">{inv.emailStatus}</td>
                  <td className="p-3">
                    {!inv.type.includes('Anulada') && (
                      <button onClick={() => handleAnular(inv.id)} className="px-2 py-1 bg-rose-50 border border-rose-200 text-rose-600 rounded font-semibold text-[11px]">
                        Solicitar NC / Anulación
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Registro Cliente */}
      {showRegisterModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex justify-center items-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
            <h3 className="font-bold text-lg text-slate-900">Registro de Cliente Presencial</h3>
            <form onSubmit={handleRegisterClient} className="space-y-3 text-sm">
              <div>
                <label className="text-xs font-semibold text-slate-500">Nombre Completo</label>
                <input required type="text" className="w-full p-2 border rounded-lg mt-1" value={newClient.name} onChange={(e) => setNewClient({ ...newClient, name: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500">N° Documento</label>
                <input required type="text" className="w-full p-2 border rounded-lg mt-1" value={newClient.document} onChange={(e) => setNewClient({ ...newClient, document: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500">Correo Electrónico</label>
                <input required type="email" className="w-full p-2 border rounded-lg mt-1" value={newClient.email} onChange={(e) => setNewClient({ ...newClient, email: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500">Teléfono</label>
                <input type="text" className="w-full p-2 border rounded-lg mt-1" value={newClient.phone} onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })} />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowRegisterModal(false)} className="flex-1 py-2 border rounded-lg text-slate-600 font-semibold">Cancelar</button>
                <button type="submit" className="flex-1 py-2 bg-emerald-600 text-white rounded-lg font-semibold">Guardar y Seleccionar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}