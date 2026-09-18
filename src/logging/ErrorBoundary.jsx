import React, { Component } from 'react'
import { captureError } from './client.js'

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    try {
      captureError(error, {
        context: {
          componentStack: errorInfo?.componentStack || undefined,
        },
      })
    } catch {
      // Logging must never crash the app
    }

    if (this.props.onError) {
      try {
        this.props.onError(error, errorInfo)
      } catch {
        // Ignore user onError errors
      }
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return typeof this.props.fallback === 'function'
          ? this.props.fallback(this.state.error)
          : this.props.fallback
      }
      return (
        <div role="alert" className="panel" style={{ margin: '2rem auto', maxWidth: '600px' }}>
          <p className="panel-title">Se ha producido un error inesperado</p>
          <p className="panel-body">
            Ha ocurrido un problema al renderizar la aplicación.
          </p>
          <button
            type="button"
            className="panel-action"
            onClick={() => window.location.reload()}
          >
            Recargar
          </button>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
