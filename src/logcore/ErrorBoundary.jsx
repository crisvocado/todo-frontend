import { Component } from 'react'

import { logError } from './client'

/**
 * Reporta los errores de render, que no llegan a window.onerror: React los
 * captura y los relanza solo hasta el boundary más cercano.
 */
export class ErrorBoundary extends Component {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error, info) {
    logError(error.message || 'render error', error, {
      labels: { handler: 'errorBoundary' },
      // La pila de componentes dice qué parte de la interfaz se cayó, que es
      // lo que el stack de JS por sí solo no cuenta.
      context: { componentStack: info.componentStack },
    })
  }

  render() {
    if (this.state.failed) return this.props.fallback ?? null
    return this.props.children
  }
}
