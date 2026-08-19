import { Component } from 'react'

import { logError } from './client'

// Un error durante el render deja el árbol desmontado y no pasa por
// window.onerror: React lo captura antes. Este boundary es la única vía para
// enterarse.
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { failed: false }
  }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error, info) {
    logError(error, {
      context: { componentStack: info?.componentStack?.slice(0, 2000) },
    })
  }

  render() {
    if (!this.state.failed) return this.props.children

    return (
      <div className="page">
        <main className="sheet">
          <div className="panel" role="alert">
            <p className="panel-title">Algo se rompió al pintar la lista.</p>
            <p className="panel-body">
              Vuelve a cargar la página. El fallo ya quedó registrado.
            </p>
            <button
              type="button"
              className="panel-action"
              onClick={() => globalThis.location.reload()}
            >
              Recargar
            </button>
          </div>
        </main>
      </div>
    )
  }
}
