import { Component } from 'react'
import { logError } from './client.js'

// Render-phase errors never reach window.onerror — React swallows them and
// unmounts the tree. This boundary is the only way to report them.
class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    logError(error?.message || 'React render error', error, {
      context: { component_stack: info?.componentStack || '' },
      labels: { handler: 'react-error-boundary' },
    })
  }

  render() {
    if (this.state.hasError) {
      return <p className="empty">Something went wrong. Please reload the page.</p>
    }
    return this.props.children
  }
}

export default ErrorBoundary
