// Global browser error handlers. These catch what React cannot: errors thrown
// outside the render tree and promise rejections nobody awaited — which is how
// a failed fetch in this app surfaces.

import { logError } from './client.js'

let uninstall = null

export function installGlobalErrorHandlers() {
  if (uninstall) return uninstall

  function onError(event) {
    logError(event.message || 'Uncaught error', event.error, {
      context: {
        source: event.filename || '',
        line: event.lineno ?? null,
        column: event.colno ?? null,
      },
      labels: { handler: 'window.onerror' },
    })
  }

  function onUnhandledRejection(event) {
    const reason = event.reason
    const message = reason instanceof Error ? reason.message : String(reason)
    logError(`Unhandled promise rejection: ${message}`, reason, {
      labels: { handler: 'unhandledrejection' },
    })
  }

  window.addEventListener('error', onError)
  window.addEventListener('unhandledrejection', onUnhandledRejection)

  uninstall = function uninstallGlobalErrorHandlers() {
    window.removeEventListener('error', onError)
    window.removeEventListener('unhandledrejection', onUnhandledRejection)
    uninstall = null
  }

  return uninstall
}
