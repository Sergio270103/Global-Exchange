/**
 * Recuerda la pantalla abierta para volver a ella al recargar.
 *
 * La navegación es un estado de React (no hay rutas en la URL), así que
 * al recargar se volvía siempre al Dashboard. Se guarda la página en
 * `sessionStorage` (solo esa pestaña, se borra al cerrarla) junto con el
 * rol: si en la pestaña entra otro rol, no se restaura una pantalla ajena.
 *
 * @module utils/paginaGuardada
 */
import type { Page, Role } from '@/types'

const CLAVE = 'ge.paginaActual'

/** Pantallas públicas: no se restauran estando autenticado. */
const PUBLICAS: Page[] = ['landing', 'login', 'register', 'verify']

/** Guarda la pantalla actual del rol indicado. */
export function guardarPagina(pagina: Page, rol: Role): void {
  if (PUBLICAS.includes(pagina)) return
  try {
    window.sessionStorage.setItem(CLAVE, JSON.stringify({ pagina, rol }))
  } catch {
    /* almacenamiento bloqueado: al recargar se vuelve al Dashboard */
  }
}

/** Pantalla guardada para ese rol, o `null` si no hay (o era de otro rol). */
export function leerPagina(rol: Role): Page | null {
  try {
    const crudo = window.sessionStorage.getItem(CLAVE)
    if (!crudo) return null
    const dato = JSON.parse(crudo) as { pagina?: Page; rol?: Role }
    if (!dato.pagina || dato.rol !== rol || PUBLICAS.includes(dato.pagina)) return null
    return dato.pagina
  } catch {
    return null
  }
}

/** Olvida la pantalla guardada (al cerrar sesión). */
export function borrarPagina(): void {
  try {
    window.sessionStorage.removeItem(CLAVE)
  } catch {
    /* nada que borrar */
  }
}
