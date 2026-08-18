import { logError } from './client'

// Catches what React cannot: errors outside the render tree (event handlers,
// timers) and promise rejections nobody handled.
export function installGlobalErrorHandlers() {
  function onError(event) {
    logError(event.message || 'Uncaught error', {
      error: event.error,
      labels: { handler: 'onerror' },
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

  window.addEventListener('error', onError)
  window.addEventListener('unhandledrejection', onUnhandledRejection)

  return function uninstallGlobalErrorHandlers() {
    window.removeEventListener('error', onError)
    window.removeEventListener('unhandledrejection', onUnhandledRejection)
  }
}
