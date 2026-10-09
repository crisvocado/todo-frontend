import React, { Component } from 'react'
import { logError } from './client.js'

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    // Preserve existing console behavior while forwarding to logcore
    logError(
      error?.message || 'React Uncaught Error',
      error,
      errorInfo?.componentStack
        ? { componentStack: errorInfo.componentStack }
        : null,
    )
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }
      return React.createElement(
        'div',
        { className: 'panel', role: 'alert', style: { margin: '2rem' } },
        React.createElement(
          'p',
          { className: 'panel-title' },
          'Ha ocurrido un error inesperado.',
        ),
        React.createElement(
          'p',
          { className: 'panel-body' },
          this.state.error?.message || 'Error de renderizado.',
        ),
        React.createElement(
          'button',
          {
            type: 'button',
            className: 'panel-action',
            onClick: () => this.setState({ hasError: false, error: null }),
          },
          'Reintentar',
        ),
      )
    }

    return this.props.children
  }
}
