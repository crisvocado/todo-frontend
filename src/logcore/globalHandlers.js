import { logcore, isEnabled } from './client'

// Catches errors that never reach a React error boundary: uncaught exceptions
// outside render and rejected promises (e.g. a failed fetch in an event handler).
export function installLogcoreGlobalHandlers() {
  if (!isEnabled || typeof window === 'undefined') return () => {}

  function onError(event) {
    logcore.error(event.message ?? 'Uncaught error', {
      error: event.error,
      context: {
        source: event.filename,
        line: event.lineno,
        column: event.colno,
        url: window.location.href,
      },
    })
  }

  function onUnhandledRejection(event) {
    const reason = event.reason
    const message =
      reason instanceof Error ? reason.message : String(reason ?? 'Unhandled rejection')

    logcore.error(message, {
      error: reason instanceof Error ? reason : undefined,
      labels: { kind: 'unhandledrejection' },
      context: { url: window.location.href },
    })
  }

  window.addEventListener('error', onError)
  window.addEventListener('unhandledrejection', onUnhandledRejection)

  return () => {
    window.removeEventListener('error', onError)
    window.removeEventListener('unhandledrejection', onUnhandledRejection)
  }
}
