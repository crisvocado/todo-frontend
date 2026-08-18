import { Component } from 'react'

import { logcore } from './client.js'

/**
 * Reports a render crash and shows a fallback instead of a blank page.
 * React swallows these: without a boundary they reach no global handler.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { crashed: false }
  }

  static getDerivedStateFromError() {
    return { crashed: true }
  }

  componentDidCatch(error, info) {
    const client = this.props.client ?? logcore
    client.logError(error, undefined, {
      context: { source: 'react', componentStack: info?.componentStack ?? '' },
    })
  }

  render() {
    if (!this.state.crashed) return this.props.children
    return (
      this.props.fallback ?? (
        <div className="panel" role="alert">
          <p className="panel-title">Algo se rompió.</p>
          <p className="panel-body">Recarga la página para volver a intentarlo.</p>
        </div>
      )
    )
  }
}
