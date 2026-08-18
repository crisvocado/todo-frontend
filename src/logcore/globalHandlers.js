import { logError } from './client.js'

// Catches what never reaches a React error boundary: errors thrown outside
// render (event handlers, timers) and rejected promises — including the
// unawaited fetch calls the app makes against the todo API.
export function installGlobalErrorHandlers(target = window) {
  function onError(event) {
    logError(event.message || 'Uncaught error', {
      error: event.error,
      labels: { handler: 'window.onerror' },
      context: {
        source: event.filename,
        line: event.lineno,
        column: event.colno,
      },
    })
  }

  function onUnhandledRejection(event) {
    const reason = event.reason
    logError(
      reason instanceof Error ? reason.message : 'Unhandled promise rejection',
      {
        error: reason,
        labels: { handler: 'unhandledrejection' },
      },
    )
  }

  target.addEventListener('error', onError)
  target.addEventListener('unhandledrejection', onUnhandledRejection)

  return function uninstallGlobalErrorHandlers() {
    target.removeEventListener('error', onError)
    target.removeEventListener('unhandledrejection', onUnhandledRejection)
  }
}
