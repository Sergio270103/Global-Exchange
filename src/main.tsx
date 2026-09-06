/**
 * Punto de entrada de la aplicación.
 *
 * Monta el componente {@link App} en el elemento `#root` del index.html e
 * importa los estilos globales de Tailwind CSS.
 *
 * @module main
 */
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
