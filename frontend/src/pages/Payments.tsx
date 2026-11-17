/** Pagos reales por cliente, estado y método (PI-27). */
import { useEffect, useState } from 'react'
import { listarOperaciones, type Operacion } from '@/services/operaciones'
import { listarClientes, type Cliente } from '@/services/clientes'
import { listarMetodos, type MetodoPago } from '@/services/metodos'
import type { AuthUser, ClienteActivo } from '@/types'

const estados: Record<string, string> = { PAGADA: 'Pagada', PENDIENTE: 'Pendiente', CANCELADA: 'Cancelada', ANULADA: 'Anulada' }
const nombres: Record<string, string> = { transfer: 'Transferencia bancaria', wallet: 'Billetera digital', card: 'Tarjeta', qr: 'QR', efectivo: 'Efectivo' }
const control = 'border border-slate-200 rounded-lg px-3 py-2 bg-white text-sm'

export default function Payments({ auth, currentClient }: { auth: AuthUser; currentClient: ClienteActivo | null }) {
  const admin = auth.role === 'admin'
  const clienteId = currentClient && currentClient.id > 0 ? currentClient.id : null
  return <ListadoPagos key={admin ? 'admin' : clienteId ?? 'sin-cliente'} admin={admin} clienteId={clienteId} />
}

function ListadoPagos({ admin, clienteId }: { admin: boolean; clienteId: number | null }) {
  const [operaciones, setOperaciones] = useState<Operacion[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [metodos, setMetodos] = useState<MetodoPago[]>([])
  const [clienteFiltro, setClienteFiltro] = useState('')
  const [estado, setEstado] = useState('')
  const [metodo, setMetodo] = useState('')
  const [cargando, setCargando] = useState(admin || clienteId !== null)
  const [error, setError] = useState('')
  const [catalogoError, setCatalogoError] = useState('')
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    let vigente = true
    setCatalogoError('')
    listarMetodos().then(ms => { if (vigente) setMetodos(ms) }).catch(() => {
      if (vigente) setCatalogoError('No se pudo cargar el catálogo de métodos.')
    })
    if (admin) listarClientes().then(cs => { if (vigente) setClientes(cs) }).catch(() => {
      if (vigente) setCatalogoError('No se pudo cargar el filtro de clientes.')
    })
    return () => { vigente = false }
  }, [admin, revision])

  useEffect(() => {
    if (!admin && clienteId === null) return
    let vigente = true
    setCargando(true)
    setError('')
    setOperaciones([])
    listarOperaciones(admin ? {} : { clienteId: clienteId!, mine: true })
      .then(ops => { if (vigente) setOperaciones(ops) })
      .catch(err => { if (vigente) setError(err instanceof Error ? err.message : 'No se pudieron cargar los pagos.') })
      .finally(() => { if (vigente) setCargando(false) })
    return () => { vigente = false }
  }, [admin, clienteId, revision])

  // Tabla y tarjetas comparten exactamente el mismo conjunto filtrado.
  const filtradas = operaciones.filter(op =>
    (!clienteFiltro || op.cliente === Number(clienteFiltro)) &&
    (!estado || op.estado === estado) && (!metodo || op.metodo_pago === metodo))
  // Se incluyen códigos históricos aunque el catálogo ya no los ofrezca.
  const codigos = [...new Set([...metodos.map(m => m.codigo), ...operaciones.map(o => o.metodo_pago)])].sort()
  const nombreMetodo = (codigo: string) => metodos.find(m => m.codigo === codigo)?.nombre || nombres[codigo] || codigo || 'Sin método registrado'

  if (!admin && clienteId === null) return <div role="status" className="p-6 bg-white rounded-xl">Seleccioná un cliente asociado en la barra superior para consultar sus pagos.</div>

  return <div className="space-y-5 animate-fadein">
    <div className="flex flex-wrap items-center gap-3 bg-white rounded-xl p-4">
      {admin && <label>Cliente <select aria-label="Cliente" className={control} value={clienteFiltro} onChange={e => setClienteFiltro(e.target.value)}>
        <option value="">Todos los clientes</option>
        {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
      </select></label>}
      <label>Estado <select aria-label="Estado" className={control} value={estado} onChange={e => setEstado(e.target.value)}>
        <option value="">Todos los estados</option>
        {Object.entries(estados).map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}
      </select></label>
      <label>Método de pago <select aria-label="Método de pago" className={control} value={metodo} onChange={e => setMetodo(e.target.value)}>
        <option value="">Todos los métodos</option>
        {codigos.filter(Boolean).map(c => <option key={c} value={c}>{nombreMetodo(c)}</option>)}
      </select></label>
      <button className={control} onClick={() => setRevision(r => r + 1)}>Actualizar</button>
    </div>
    {catalogoError && <p role="alert">{catalogoError}</p>}
    {cargando ? <p role="status">Cargando pagos…</p> : error ? <p role="alert">{error}</p> : <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4" aria-label="Resumen de pagos">
        {['transfer', 'wallet', 'card', 'qr', ...codigos.filter(c => c && !['transfer', 'wallet', 'card', 'qr'].includes(c))].map(c =>
          <div key={c} className="bg-white rounded-xl border border-slate-100 p-4">
            <div className="font-mono font-bold text-lg" aria-label={`Cantidad ${nombreMetodo(c)}`}>{filtradas.filter(o => o.metodo_pago === c).length}</div>
            <div className="text-sm text-slate-500">{nombreMetodo(c)}</div>
          </div>)}
      </div>
      {filtradas.length === 0 ? <p role="status" className="bg-white p-8 rounded-xl text-center">No hay pagos para los filtros seleccionados.</p> :
        <div className="bg-white rounded-xl overflow-x-auto"><table className="w-full text-sm">
          <thead><tr>{['Operación', 'Fecha', 'Cliente', 'Método de pago', 'Importe enviado', 'Estado'].map(h => <th key={h} className="text-left p-4">{h}</th>)}</tr></thead>
          <tbody>{filtradas.map(op => <tr key={op.id} className="border-t border-slate-100">
            <td className="p-4">OP-{op.id}</td>
            <td className="p-4">{new Date(op.fecha_creacion).toLocaleString('es-PY')}</td>
            <td className="p-4">{op.cliente_nombre}</td>
            <td className="p-4">{nombreMetodo(op.metodo_pago)}</td>
            <td className="p-4 font-mono">{op.monto_enviado.toLocaleString('es-PY', { maximumFractionDigits: op.moneda_origen_codigo === 'PYG' ? 0 : 2 })} {op.moneda_origen_codigo}</td>
            <td className="p-4">{estados[op.estado] || op.estado}</td>
          </tr>)}</tbody>
        </table></div>}
    </>}
  </div>
}
