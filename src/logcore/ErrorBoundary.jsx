import { Component } from 'react'
import { logError } from './client.js'

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { failed: false }
  }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error, info) {
    logError(error.message || 'React render error', {
      error,
      labels: { handler: 'react.errorBoundary' },
      context: { component_stack: info?.componentStack },
    })
  }

  render() {
    if (this.state.failed) {
      return this.props.fallback ?? <p className="empty">Something went wrong.</p>
    }
    return this.props.children
  }
}
