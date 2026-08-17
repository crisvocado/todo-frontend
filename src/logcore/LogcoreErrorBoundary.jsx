import { Component } from 'react'
import { logcore } from './client'

// Reports render-phase errors to logcore, then shows a fallback instead of a blank page.
export class LogcoreErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    logcore.error(error?.message ?? 'React render error', {
      error,
      labels: { kind: 'react-error-boundary' },
      context: {
        component_stack: info?.componentStack,
        url: typeof window !== 'undefined' ? window.location.href : undefined,
      },
    })
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? <p className="empty">Something went wrong.</p>
    }
    return this.props.children
  }
}

export default LogcoreErrorBoundary
