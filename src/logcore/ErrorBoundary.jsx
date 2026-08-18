import { Component } from 'react'
import { logError } from './client'

export default class ErrorBoundary extends Component {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error, info) {
    logError(error?.message || 'React render error', {
      error,
      labels: { handler: 'error-boundary' },
      context: { component_stack: info?.componentStack ?? '' },
    })
  }

  render() {
    if (this.state.failed) {
      return this.props.fallback ?? <p className="empty">Something went wrong.</p>
    }
    return this.props.children
  }
}
