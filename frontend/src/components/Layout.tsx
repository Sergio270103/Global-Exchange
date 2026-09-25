/**
 * Layout principal de las secciones autenticadas.
 *
 * Compone la barra lateral ({@link Sidebar}), la barra superior
 * ({@link Navbar}) y el área de contenido del usuario autenticado.
 *
 * @module Layout
 */
import { useState } from 'react'
import Sidebar from './Sidebar'
import Navbar from './Navbar'
import { type Page, type AuthUser, type ClienteActivo } from '@/types'

/** Propiedades del layout principal de la aplicación. */
export interface LayoutProps {
  /** Usuario autenticado. */
  auth: AuthUser
  /** Página actualmente visible. */
  currentPage: Page
  /** Función para navegar entre páginas. */
  navigate: (p: Page) => void
  /** Callback ejecutado al cerrar sesión. */
  onLogout: () => void
  /** Cliente seleccionado en la sesión. */
  currentClient: ClienteActivo | null
  /** Actualiza el cliente seleccionado. */
  setCurrentClient: (c: ClienteActivo | null) => void
  /** Contenido de la página a renderizar. */
  children: React.ReactNode
}

/**
 * Renderiza el shell de la aplicación autenticada.
 *
 * @param props - Propiedades del layout.
 * @returns la estructura con sidebar, navbar y contenido.
 */
export default function Layout({ auth, currentPage, navigate, onLogout, currentClient, setCurrentClient, children }: LayoutProps) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden bg-slate-100">
      <Sidebar
        auth={auth}
        currentPage={currentPage}
        navigate={navigate}
        onLogout={onLogout}
        collapsed={collapsed}
        onToggle={() => setCollapsed(v => !v)}
      />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Navbar
          auth={auth}
          currentPage={currentPage}
          navigate={navigate}
          onLogout={onLogout}
          currentClient={currentClient}
          setCurrentClient={setCurrentClient}
        />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
