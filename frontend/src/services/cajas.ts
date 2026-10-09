/**
 * Servicio de control de cajas (PI-44, PI-43, PI-78; ERS RF56–RF58).
 *
 * Desde PI-78 el saldo se maneja por **total de cada divisa**; la
 * denominación solo se registra en las entregas de billetes.
 *
 * - `listarCajas()`: cajas activas.
 * - `obtenerSaldo(cajaId)`: saldo de la caja por divisa.
 * - `registrarMovimiento(...)`: ingreso o retiro por monto. Devuelve el
 *   saldo ya actualizado.
 * - `listarArqueos` / `registrarArqueo`: recuento de la caja por total de
 *   cada moneda (sistema vs. contado).
 * - `listarDenominaciones()`: catálogo de billetes por moneda, para cargar
 *   una entrega.
 * - Entregas de billetes (PI-43, RF57): el admin las registra
 *   (`crearEntrega`) y quedan pendientes; el cajero las confirma
 *   (`confirmarEntrega`, se suman al saldo) o rechaza con motivo; el admin
 *   puede cancelar una pendiente.
 *
 * @module services/cajas
 */
import { apiFetch } from '@/services/api'
import { banderaDesdeCodigo } from '@/services/monedas'

/** Caja de una sucursal. */
export interface Caja {
  id: number
  nombre: string
  sucursal: string
  activa: boolean
}

/** Tipos de movimiento de efectivo. */
export type TipoMovimiento = 'INGRESO' | 'ENTREGA' | 'RETIRO'

/** Datos de una moneda que usan las pantallas de caja. */
export interface MonedaCaja {
  moneda: number
  codigo: string
  nombre: string
  simbolo: string
  decimales: number
  flag: string
}

/** Saldo de la caja en una moneda (total, sin detalle de billetes). */
export interface SaldoMoneda extends MonedaCaja {
  total: number
}

/** Billetes habilitados de una moneda (catálogo para las entregas). */
export interface CatalogoMoneda extends MonedaCaja {
  denominaciones: { denominacion: number; valor: number }[]
}

/** Movimiento de efectivo ya registrado. */
export interface MovimientoCaja {
  id: number
  tipo: TipoMovimiento
  tipoDisplay: string
  monedaCodigo: string
  total: number
  /** Saldo de la divisa después del movimiento (puede faltar en datos viejos). */
  saldoResultante: number | null
  usuarioNombre: string
  observacion: string
  creadoEn: string
}

/** Línea de un arqueo: total según sistema vs. total contado de una moneda. */
export interface LineaArqueo {
  moneda: number
  monedaCodigo: string
  simbolo: string
  decimales: number
  montoSistema: number
  montoContado: number
  diferencia: number
}

/** Arqueo o cierre de turno registrado. */
export interface Arqueo {
  id: number
  usuarioNombre: string
  observacion: string
  conDiferencias: boolean
  creadoEn: string
  detalle: LineaArqueo[]
}

/** Estados de una entrega de billetes. */
export type EstadoEntrega = 'PENDIENTE' | 'CONFIRMADA' | 'RECHAZADA' | 'CANCELADA'

/** Total entregado de una divisa. */
export interface TotalEntrega {
  moneda: number
  monedaCodigo: string
  simbolo: string
  decimales: number
  total: number
  cantidadBilletes: number
}

/** Entrega de billetes del administrador a una caja (PI-43). */
export interface Entrega {
  id: number
  caja: number
  cajaNombre: string
  estado: EstadoEntrega
  estadoDisplay: string
  entregadoPorNombre: string
  observacion: string
  creadoEn: string
  respondidoPorNombre: string
  fechaRespuesta: string | null
  motivo: string
  totales: TotalEntrega[]
  detalle: { denominacion: number; monedaCodigo: string; valor: number; cantidad: number; subtotal: number }[]
}

/** Billetes de una denominación que se cargan en una entrega. */
export interface LineaBilletes {
  denominacion: number
  cantidad: number
}

// --- Formas que devuelve la API ----------------------------------------

interface SaldoMonedaApi {
  moneda: number
  moneda_codigo: string
  moneda_nombre: string
  simbolo: string
  decimales: number
  total: string
}

interface DenominacionApi {
  id: number
  moneda: number
  moneda_codigo: string
  moneda_nombre: string
  simbolo: string
  decimales: number
  valor: string
}

interface MovimientoApi {
  id: number
  tipo: TipoMovimiento
  tipo_display: string
  moneda_codigo: string
  total: string
  saldo_resultante: string | null
  usuario_nombre: string
  observacion: string
  creado_en: string
}

interface ArqueoApi {
  id: number
  usuario_nombre: string
  observacion: string
  con_diferencias: boolean
  creado_en: string
  detalle: {
    moneda: number
    moneda_codigo: string
    simbolo: string
    decimales: number
    monto_sistema: string
    monto_contado: string
    diferencia: string
  }[]
}

interface EntregaApi {
  id: number
  caja: number
  caja_nombre: string
  estado: EstadoEntrega
  estado_display: string
  entregado_por_nombre: string
  observacion: string
  creado_en: string
  respondido_por_nombre: string
  fecha_respuesta: string | null
  motivo: string
  totales: {
    moneda: number; moneda_codigo: string; simbolo: string; decimales: number
    total: string; cantidad_billetes: number
  }[]
  detalle: { denominacion: number; moneda_codigo: string; valor: string; cantidad: number; subtotal: string }[]
}

function mapearEntrega(e: EntregaApi): Entrega {
  return {
    id: e.id,
    caja: e.caja,
    cajaNombre: e.caja_nombre,
    estado: e.estado,
    estadoDisplay: e.estado_display,
    entregadoPorNombre: e.entregado_por_nombre,
    observacion: e.observacion,
    creadoEn: e.creado_en,
    respondidoPorNombre: e.respondido_por_nombre,
    fechaRespuesta: e.fecha_respuesta,
    motivo: e.motivo,
    totales: e.totales.map(t => ({
      moneda: t.moneda,
      monedaCodigo: t.moneda_codigo,
      simbolo: t.simbolo,
      decimales: t.decimales,
      total: Number(t.total),
      cantidadBilletes: t.cantidad_billetes,
    })),
    detalle: e.detalle.map(d => ({
      denominacion: d.denominacion,
      monedaCodigo: d.moneda_codigo,
      valor: Number(d.valor),
      cantidad: d.cantidad,
      subtotal: Number(d.subtotal),
    })),
  }
}

function mapearSaldo(m: SaldoMonedaApi): SaldoMoneda {
  return {
    moneda: m.moneda,
    codigo: m.moneda_codigo,
    nombre: m.moneda_nombre,
    simbolo: m.simbolo,
    decimales: m.decimales,
    flag: banderaDesdeCodigo(m.moneda_codigo),
    total: Number(m.total),
  }
}

function mapearMovimiento(m: MovimientoApi): MovimientoCaja {
  return {
    id: m.id,
    tipo: m.tipo,
    tipoDisplay: m.tipo_display,
    monedaCodigo: m.moneda_codigo,
    total: Number(m.total),
    saldoResultante: m.saldo_resultante === null ? null : Number(m.saldo_resultante),
    usuarioNombre: m.usuario_nombre,
    observacion: m.observacion,
    creadoEn: m.creado_en,
  }
}

function mapearArqueo(a: ArqueoApi): Arqueo {
  return {
    id: a.id,
    usuarioNombre: a.usuario_nombre,
    observacion: a.observacion,
    conDiferencias: a.con_diferencias,
    creadoEn: a.creado_en,
    detalle: a.detalle.map(d => ({
      moneda: d.moneda,
      monedaCodigo: d.moneda_codigo,
      simbolo: d.simbolo,
      decimales: d.decimales,
      montoSistema: Number(d.monto_sistema),
      montoContado: Number(d.monto_contado),
      diferencia: Number(d.diferencia),
    })),
  }
}

/** Lista las cajas activas. */
export async function listarCajas(): Promise<Caja[]> {
  return apiFetch<Caja[]>('/cajas/')
}

/** Saldo de la caja por divisa (RF56). */
export async function obtenerSaldo(cajaId: number): Promise<SaldoMoneda[]> {
  const datos = await apiFetch<{ monedas: SaldoMonedaApi[] }>(`/cajas/${cajaId}/saldo/`)
  return datos.monedas.map(mapearSaldo)
}

/** Últimos movimientos de la caja, del más reciente al más antiguo. */
export async function listarMovimientos(
  cajaId: number,
  filtros: { moneda?: string; tipo?: TipoMovimiento; limite?: number } = {},
): Promise<MovimientoCaja[]> {
  const qs = new URLSearchParams()
  if (filtros.moneda) qs.set('moneda', filtros.moneda)
  if (filtros.tipo) qs.set('tipo', filtros.tipo)
  if (filtros.limite) qs.set('limite', String(filtros.limite))
  const sufijo = qs.toString() ? `?${qs}` : ''
  const datos = await apiFetch<MovimientoApi[]>(`/cajas/${cajaId}/movimientos/${sufijo}`)
  return datos.map(mapearMovimiento)
}

/**
 * Registra un ingreso o retiro por monto y devuelve el saldo actualizado
 * (RF58). Las entregas de billetes van por `crearEntrega` (requieren
 * confirmación).
 *
 * @throws {ApiError} Con el mensaje del backend, por ejemplo si un retiro
 *   supera el saldo de la divisa.
 */
export async function registrarMovimiento(
  cajaId: number,
  datos: { tipo: 'INGRESO' | 'RETIRO'; moneda: number; monto: number; observacion?: string },
): Promise<{ movimiento: MovimientoCaja; saldo: SaldoMoneda[] }> {
  const res = await apiFetch<{ movimiento: MovimientoApi; monedas: SaldoMonedaApi[] }>(
    `/cajas/${cajaId}/movimientos/`,
    {
      method: 'POST',
      body: JSON.stringify({
        tipo: datos.tipo,
        moneda: datos.moneda,
        monto: String(datos.monto),
        observacion: datos.observacion ?? '',
      }),
    },
  )
  return { movimiento: mapearMovimiento(res.movimiento), saldo: res.monedas.map(mapearSaldo) }
}

/** Últimos arqueos / cierres de turno de la caja. */
export async function listarArqueos(cajaId: number, limite = 10): Promise<Arqueo[]> {
  const datos = await apiFetch<ArqueoApi[]>(`/cajas/${cajaId}/arqueos/?limite=${limite}`)
  return datos.map(mapearArqueo)
}

/**
 * Registra un arqueo con el total contado de cada moneda. No modifica el
 * saldo: solo deja constancia (con diferencias, si las hay).
 */
export async function registrarArqueo(
  cajaId: number,
  conteo: { moneda: number; monto: number }[],
  observacion = '',
): Promise<Arqueo> {
  const datos = await apiFetch<ArqueoApi>(`/cajas/${cajaId}/arqueos/`, {
    method: 'POST',
    body: JSON.stringify({
      conteo: conteo.map(l => ({ moneda: l.moneda, monto: String(l.monto) })),
      observacion,
    }),
  })
  return mapearArqueo(datos)
}

/**
 * Catálogo de billetes habilitados, agrupado por moneda y ordenado de la
 * denominación mayor a la menor. Lo usa el formulario de entregas.
 */
export async function listarDenominaciones(): Promise<CatalogoMoneda[]> {
  const datos = await apiFetch<DenominacionApi[]>('/denominaciones/?activas=1')
  const grupos = new Map<number, CatalogoMoneda>()
  for (const d of datos) {
    let grupo = grupos.get(d.moneda)
    if (!grupo) {
      grupo = {
        moneda: d.moneda,
        codigo: d.moneda_codigo,
        nombre: d.moneda_nombre,
        simbolo: d.simbolo,
        decimales: d.decimales,
        flag: banderaDesdeCodigo(d.moneda_codigo),
        denominaciones: [],
      }
      grupos.set(d.moneda, grupo)
    }
    grupo.denominaciones.push({ denominacion: d.id, valor: Number(d.valor) })
  }
  return [...grupos.values()]
    .map(g => ({ ...g, denominaciones: [...g.denominaciones].sort((a, b) => b.valor - a.valor) }))
    .sort((a, b) => a.codigo.localeCompare(b.codigo))
}

/** Lista entregas de billetes, de la más reciente a la más antigua. */
export async function listarEntregas(
  filtros: { caja?: number; estado?: EstadoEntrega; limite?: number } = {},
): Promise<Entrega[]> {
  const qs = new URLSearchParams()
  if (filtros.caja) qs.set('caja', String(filtros.caja))
  if (filtros.estado) qs.set('estado', filtros.estado)
  if (filtros.limite) qs.set('limite', String(filtros.limite))
  const sufijo = qs.toString() ? `?${qs}` : ''
  const datos = await apiFetch<EntregaApi[]>(`/entregas/${sufijo}`)
  return datos.map(mapearEntrega)
}

/**
 * Registra una entrega de billetes a una caja (solo admin). Queda
 * pendiente: no modifica el saldo hasta que el cajero la confirme.
 */
export async function crearEntrega(
  cajaId: number, detalle: LineaBilletes[], observacion = '',
): Promise<Entrega> {
  const datos = await apiFetch<EntregaApi>('/entregas/', {
    method: 'POST',
    body: JSON.stringify({ caja: cajaId, detalle: detalle.filter(l => l.cantidad > 0), observacion }),
  })
  return mapearEntrega(datos)
}

/** El cajero confirma la recepción: devuelve la entrega y el saldo actualizado. */
export async function confirmarEntrega(id: number): Promise<{ entrega: Entrega; saldo: SaldoMoneda[] }> {
  const res = await apiFetch<{ entrega: EntregaApi; monedas: SaldoMonedaApi[] }>(
    `/entregas/${id}/confirmar/`, { method: 'POST', body: '{}' },
  )
  return { entrega: mapearEntrega(res.entrega), saldo: res.monedas.map(mapearSaldo) }
}

/** El cajero rechaza la entrega indicando el motivo. */
export async function rechazarEntrega(id: number, motivo: string): Promise<Entrega> {
  const datos = await apiFetch<EntregaApi>(`/entregas/${id}/rechazar/`, {
    method: 'POST', body: JSON.stringify({ motivo }),
  })
  return mapearEntrega(datos)
}

/** El admin cancela una entrega que todavía no se confirmó. */
export async function cancelarEntrega(id: number, motivo: string): Promise<Entrega> {
  const datos = await apiFetch<EntregaApi>(`/entregas/${id}/cancelar/`, {
    method: 'POST', body: JSON.stringify({ motivo }),
  })
  return mapearEntrega(datos)
}

/**
 * Formatea un monto según los decimales de la moneda (es-PY).
 *
 * @example formatearMonto(1500000, 0) // "1.500.000"
 */
export function formatearMonto(valor: number, decimales = 2): string {
  return valor.toLocaleString('es-PY', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimales,
  })
}
